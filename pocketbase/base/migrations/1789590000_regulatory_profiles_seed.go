package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// FAARegulatoryProfileId and EASARegulatoryProfileId are the fixed ids of
// the two rows seeded below. findOrCreatePilotRecord
// (apps/web/src/lib/server/pilots.ts) hardcodes FAARegulatoryProfileId as
// the default `regulatory_profile` for newly created pilots, so these ids
// must stay stable — never regenerate them in a later migration.
const FAARegulatoryProfileId = "faaregulatory01"
const EASARegulatoryProfileId = "easaregulatory1"

// regulatory_profiles has sat as unused schema since the initial snapshot.
// This gives it its first real rows: one per jurisdiction this app
// resolves a pilot's currency rules against. `rules` is kept to a bare
// `code` identifier rather than a JSON-driven rules engine — the actual
// per-jurisdiction currency logic lives in typed TypeScript functions in
// packages/core/src/currency (medicalCurrency/basicMedCurrency for FAA,
// easaMedicalCurrency for EASA), the same way this codebase already
// hardcodes FLIGHT_REVIEW_MONTHS and friends rather than reading them from
// data.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_3133624946")
		if err != nil {
			return err
		}

		faa := core.NewRecord(collection)
		faa.Id = FAARegulatoryProfileId
		faa.Set("name", "FAA")
		faa.Set("rules", map[string]any{"code": "faa"})
		if err := app.Save(faa); err != nil {
			return err
		}

		easa := core.NewRecord(collection)
		easa.Id = EASARegulatoryProfileId
		easa.Set("name", "EASA")
		easa.Set("rules", map[string]any{"code": "easa"})
		if err := app.Save(easa); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		for _, id := range []string{FAARegulatoryProfileId, EASARegulatoryProfileId} {
			record, err := app.FindRecordById("pbc_3133624946", id)
			if err != nil {
				continue
			}
			if err := app.Delete(record); err != nil {
				return err
			}
		}
		return nil
	})
}
