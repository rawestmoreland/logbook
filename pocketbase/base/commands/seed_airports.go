// Package commands holds custom PocketBase CLI commands for this backend.
package commands

import (
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

// OurAirports publishes a daily-refreshed snapshot of the same public-domain
// dataset used before this became a PocketBase collection (see the deleted
// scripts/build-airports-db.js). Airport data changes rarely enough that a
// live sync isn't worth it — re-run `airports:seed` occasionally instead.
const airportsSourceURL = "https://davidmegginson.github.io/ourairports-data/airports.csv"

// Airport types worth keeping for a pilot logbook — drops closed fields and
// non-flyable entries (balloonports still fly, so they stay). Must match the
// `type` select field's values in the airports collection migration.
var keepAirportTypes = map[string]bool{
	"large_airport":  true,
	"medium_airport": true,
	"small_airport":  true,
	"heliport":       true,
	"seaplane_base":  true,
	"balloonport":    true,
}

// requiredAirportColumns are the OurAirports CSV columns this command reads.
// Checked up front so a format change in the upstream file fails with a
// clear message instead of a confusing panic partway through the import.
var requiredAirportColumns = []string{
	"ident", "type", "name", "icao_code", "iata_code",
	"municipality", "iso_country", "iso_region",
	"latitude_deg", "longitude_deg", "elevation_ft",
}

// airportRow is one filtered, mapped CSV row — the shape written into the
// airports collection. Kept separate from *core.Record so the CSV parsing
// and filtering (the part most likely to break when upstream changes
// something) is plain data and testable without a PocketBase app.
type airportRow struct {
	ident        string
	icao         string
	iata         string
	airportType  string
	name         string
	municipality string
	country      string
	region       string
	lat          float64
	lon          float64
	elevationFt  float64
}

// RegisterAirportsSeedCommand adds `airports:seed` to the PocketBase CLI. It
// downloads the OurAirports dataset and upserts it into the `airports`
// collection, keyed on `ident`. Safe to re-run: existing rows are matched by
// ident and updated in place rather than duplicated.
//
// Takes rootCmd separately rather than the concrete *pocketbase.PocketBase —
// core.App has no RootCmd field, only the concrete app does — mirroring how
// migratecmd.MustRegister(app, app.RootCmd, ...) is already called in main.go.
func RegisterAirportsSeedCommand(app core.App, rootCmd *cobra.Command) {
	rootCmd.AddCommand(&cobra.Command{
		Use:   "airports:seed",
		Short: "Download the OurAirports dataset and seed the airports collection",
		RunE: func(cmd *cobra.Command, args []string) error {
			return seedAirports(app)
		},
	})
}

func seedAirports(app core.App) error {
	kept, skipped, err := SeedAirportsFromURL(app, airportsSourceURL)
	if err != nil {
		return err
	}
	app.Logger().Info("airports seeded", "kept", kept, "skipped", skipped)
	return nil
}

// SeedAirportsFromURL fetches an OurAirports-formatted CSV from url and
// upserts it into the airports collection, keyed on ident. Exported (rather
// than folded into seedAirports) so it can be exercised against a local
// httptest server — the real dataset lives outside this module and
// shouldn't be a dependency of testing the upsert logic itself.
func SeedAirportsFromURL(app core.App, url string) (kept, skipped int, err error) {
	collection, err := app.FindCollectionByNameOrId("airports")
	if err != nil {
		return 0, 0, fmt.Errorf("airports collection not found (run migrations first): %w", err)
	}

	app.Logger().Info("fetching airport data", "url", url)
	resp, err := http.Get(url)
	if err != nil {
		return 0, 0, fmt.Errorf("fetching airports.csv: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("fetching airports.csv: unexpected status %s", resp.Status)
	}

	rows, skipped, err := parseAirportsCSV(resp.Body)
	if err != nil {
		return 0, 0, err
	}

	err = app.RunInTransaction(func(txApp core.App) error {
		for _, a := range rows {
			record, findErr := findOrNewAirportRecord(txApp, collection, a.ident)
			if findErr != nil {
				return fmt.Errorf("looking up %q: %w", a.ident, findErr)
			}

			record.Set("ident", a.ident)
			record.Set("icao", a.icao)
			record.Set("iata", a.iata)
			record.Set("type", a.airportType)
			record.Set("name", a.name)
			record.Set("municipality", a.municipality)
			record.Set("country", a.country)
			record.Set("region", a.region)
			record.Set("lat", a.lat)
			record.Set("lon", a.lon)
			record.Set("elevation_ft", a.elevationFt)

			if saveErr := txApp.Save(record); saveErr != nil {
				return fmt.Errorf("saving %q: %w", a.ident, saveErr)
			}
			kept++
		}
		return nil
	})
	if err != nil {
		return 0, 0, err
	}

	return kept, skipped, nil
}

// parseAirportsCSV reads an OurAirports airports.csv, keeping only the
// flyable types in keepAirportTypes and mapping columns to airportRow. It
// validates the header before reading any data rows, so an upstream format
// change fails with a clear message rather than a wrong or partial import.
func parseAirportsCSV(r io.Reader) (rows []airportRow, skipped int, err error) {
	reader := csv.NewReader(r)
	// OurAirports quotes fields containing commas (e.g. some `name` values);
	// FieldsPerRecord defaults to enforcing a fixed column count, which is
	// what we want — a short row means the format changed underneath us.

	header, err := reader.Read()
	if err != nil {
		return nil, 0, fmt.Errorf("reading airports.csv header: %w", err)
	}
	col := make(map[string]int, len(header))
	for i, name := range header {
		col[name] = i
	}
	for _, name := range requiredAirportColumns {
		if _, ok := col[name]; !ok {
			return nil, 0, fmt.Errorf("airports.csv is missing expected column %q — upstream format may have changed", name)
		}
	}

	for {
		row, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, 0, fmt.Errorf("reading airports.csv: %w", readErr)
		}

		airportType := row[col["type"]]
		ident := row[col["ident"]]
		if ident == "" || !keepAirportTypes[airportType] {
			skipped++
			continue
		}

		icao := row[col["icao_code"]]
		// A handful of US airports use their 4-letter local identifier as
		// their de facto ICAO code without OurAirports recording it
		// separately — the old bundled-asset build carried the same
		// fallback, kept here so search behaves identically.
		if icao == "" && len(ident) == 4 {
			icao = ident
		}

		rows = append(rows, airportRow{
			ident:        ident,
			icao:         icao,
			iata:         row[col["iata_code"]],
			airportType:  airportType,
			name:         row[col["name"]],
			municipality: row[col["municipality"]],
			country:      row[col["iso_country"]],
			region:       row[col["iso_region"]],
			lat:          parseFloatOrZero(row[col["latitude_deg"]]),
			lon:          parseFloatOrZero(row[col["longitude_deg"]]),
			elevationFt:  parseFloatOrZero(row[col["elevation_ft"]]),
		})
	}

	return rows, skipped, nil
}

func findOrNewAirportRecord(app core.App, collection *core.Collection, ident string) (*core.Record, error) {
	record, err := app.FindFirstRecordByFilter(collection, "ident = {:ident}", map[string]any{"ident": ident})
	if err == nil {
		return record, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return core.NewRecord(collection), nil
}

// parseFloatOrZero defaults a blank or malformed CSV cell to 0 rather than
// erroring the whole import. PocketBase's number field has no representable
// null (its documented zero value is 0 — see NumberField in the pocketbase
// module), so an unset lat/lon/elevation is indistinguishable from a
// genuine 0 once stored either way; failing the row entirely over a missing
// elevation on some obscure entry would be a worse outcome.
func parseFloatOrZero(s string) float64 {
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}
