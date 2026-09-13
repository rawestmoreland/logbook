package commands

import (
	"strings"
	"testing"
)

// A realistic slice of the real OurAirports header and row shapes: a quoted
// name containing a comma, a closed field that must be dropped, a small
// airport with no ICAO code that falls back to its 4-letter ident, one with
// a real 3-letter local code plus no ICAO/IATA at all, and a blank
// elevation cell.
const sampleCSV = `id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,icao_code,iata_code,local_code,home_link,wikipedia_link,keywords
6523,00A,heliport,"Total Rf Heliport, LLC",40.07080078,-74.93360138,11,NA,US,US-PA,Bensalem,no,00A,,,00A,,,
6524,00AA,closed,Aero B Ranch Airport,38.70402,-101.473911,3435,NA,US,US-KS,Leoti,no,,,,,,,
6525,00AK,small_airport,Lowell Field,59.94919968,-151.6959991,450,NA,US,US-AK,Anchor Point,no,00AK,,,00AK,,,
6526,00AL,small_airport,Epps Airpark,34.86479950,-86.77030182,820,NA,US,US-AL,Harvest,no,00AL,,,00AL,,,
6527,03N,seaplane_base,Utopia Seaplane Base,44.11669921875,-70.69499969482422,0,NA,US,US-ME,Moose Pond,no,,,,,,,
323361,KJFK,large_airport,John F Kennedy International Airport,40.639447,-73.779317,13,NA,US,US-NY,New York,yes,KJFK,KJFK,JFK,JFK,,,
6528,00CA,heliport,Goodyear Air Base Heliport,33.4383010864,-112.3760986,,NA,US,US-AZ,"Litchfield Park",no,00CA,,,00CA,,,
`

func TestParseAirportsCSV_filtersAndMaps(t *testing.T) {
	rows, skipped, err := parseAirportsCSV(strings.NewReader(sampleCSV))
	if err != nil {
		t.Fatalf("parseAirportsCSV returned an error: %v", err)
	}

	// The one closed-type row is dropped; every other row is kept.
	if skipped != 1 {
		t.Errorf("skipped = %d, want 1 (the closed field)", skipped)
	}
	if len(rows) != 6 {
		t.Fatalf("got %d rows, want 6: %+v", len(rows), rows)
	}

	byIdent := make(map[string]airportRow, len(rows))
	for _, r := range rows {
		byIdent[r.ident] = r
	}

	if _, ok := byIdent["00AA"]; ok {
		t.Error("closed-type airport 00AA should have been dropped, not kept")
	}

	t.Run("falls back to ident as icao for a bare 4-letter code with none recorded", func(t *testing.T) {
		r, ok := byIdent["00AK"]
		if !ok {
			t.Fatal("00AK missing from parsed rows")
		}
		if r.icao != "00AK" {
			t.Errorf("icao = %q, want the ident fallback %q", r.icao, "00AK")
		}
	})

	t.Run("does not fabricate an icao for a non-4-letter ident", func(t *testing.T) {
		r, ok := byIdent["03N"]
		if !ok {
			t.Fatal("03N missing from parsed rows")
		}
		if r.icao != "" {
			t.Errorf("icao = %q, want empty — 03N is 3 characters, not a real ICAO code", r.icao)
		}
	})

	t.Run("keeps a real icao/iata pair untouched", func(t *testing.T) {
		r, ok := byIdent["KJFK"]
		if !ok {
			t.Fatal("KJFK missing from parsed rows")
		}
		if r.icao != "KJFK" || r.iata != "JFK" {
			t.Errorf("icao=%q iata=%q, want KJFK/JFK", r.icao, r.iata)
		}
		if r.lat == 0 || r.lon == 0 {
			t.Errorf("lat/lon should be parsed, not zero: lat=%v lon=%v", r.lat, r.lon)
		}
	})

	t.Run("a blank elevation cell parses as 0, not an error", func(t *testing.T) {
		r, ok := byIdent["00CA"]
		if !ok {
			t.Fatal("00CA missing from parsed rows")
		}
		if r.elevationFt != 0 {
			t.Errorf("elevationFt = %v, want 0 for a blank cell", r.elevationFt)
		}
		// The quoted municipality ("Litchfield Park") must survive CSV
		// quoting intact, not get truncated at a stray comma.
		if r.municipality != "Litchfield Park" {
			t.Errorf("municipality = %q, want %q", r.municipality, "Litchfield Park")
		}
	})

	t.Run("a true sea-level elevation is preserved, not treated as missing", func(t *testing.T) {
		r, ok := byIdent["03N"]
		if !ok {
			t.Fatal("03N missing from parsed rows")
		}
		if r.elevationFt != 0 {
			t.Errorf("elevationFt = %v, want 0 (a real, present value from the CSV)", r.elevationFt)
		}
	})
}

func TestParseAirportsCSV_missingColumnFailsClearly(t *testing.T) {
	badCSV := "id,ident,type,name\n1,KXXX,small_airport,Test Field\n"
	_, _, err := parseAirportsCSV(strings.NewReader(badCSV))
	if err == nil {
		t.Fatal("expected an error for a header missing required columns, got nil")
	}
	if !strings.Contains(err.Error(), "icao_code") {
		t.Errorf("error should name a missing column, got: %v", err)
	}
}

func TestParseAirportsCSV_emptyIdentIsSkipped(t *testing.T) {
	csvText := "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,icao_code,iata_code,local_code,home_link,wikipedia_link,keywords\n" +
		"1,,small_airport,No Ident,0,0,0,NA,US,US-CA,Nowhere,no,,,,,,,\n"
	rows, skipped, err := parseAirportsCSV(strings.NewReader(csvText))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 0 || skipped != 1 {
		t.Errorf("got rows=%d skipped=%d, want rows=0 skipped=1", len(rows), skipped)
	}
}

func TestParseFloatOrZero(t *testing.T) {
	cases := map[string]float64{
		"":             0,
		"0":            0,
		"12.5":         12.5,
		"-74.933":      -74.933,
		"not-a-number": 0,
	}
	for in, want := range cases {
		if got := parseFloatOrZero(in); got != want {
			t.Errorf("parseFloatOrZero(%q) = %v, want %v", in, got, want)
		}
	}
}
