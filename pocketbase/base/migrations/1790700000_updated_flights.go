package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds the "aircraft as logged" snapshot fields to flights (issue #71):
// aircraft/aircraft_models are shared rows keyed by tail number, so a later
// correction to a tail's model (e.g. a CRJ700 reclassified as a CRJ550,
// mirroring the MyFlightBook example in the issue) would otherwise
// retroactively change every already-logged flight's displayed type and
// part 61 currency, since flights.aircraft is a live relation, not a copy.
// These six fields freeze the type description and the currency-relevant
// flags (category_class, complex, high_performance, tailwheel, engine_type)
// at the moment a flight is created or edited — apps/web/src/lib/server/
// flights.ts writes them alongside the aircraft relation on every save, and
// every read site prefers them over the live aircraft.model expand, via
// resolveAircraftType in packages/core/src/aircraft.ts. Left optional/blank
// on existing rows here; 1790800000_backfill_flights_aircraft_snapshot.go
// fills them in from each flight's current live aircraft/model data.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"autogeneratePattern": "",
			"help": "The aircraft's type description as it was when this flight was logged (e.g. \"Cessna 172\"), frozen at save time so a later correction to the shared aircraft_models catalog can't change how an already-logged flight displays.",
			"hidden": false,
			"id": "text2481093756",
			"max": 0,
			"min": 0,
			"name": "logged_aircraft_type",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "The aircraft model's category_class as it was when this flight was logged — see logged_aircraft_type.",
			"hidden": false,
			"id": "select3812904567",
			"maxSelect": 1,
			"name": "logged_category_class",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"airplane_single_engine_land",
				"airplane_multi_engine_land",
				"airplane_single_engine_sea",
				"airplane_multi_engine_sea",
				"rotorcraft_helicopter",
				"rotorcraft_gyroplane",
				"glider",
				"lighter_than_air_airship",
				"lighter_than_air_balloon",
				"powered_lift",
				"powered_parachute_land",
				"powered_parachute_sea",
				"weight_shift_control_land",
				"weight_shift_control_sea"
			]
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "The aircraft model's complex flag (14 CFR 61.31(e)) as it was when this flight was logged — see logged_aircraft_type. Currency calculations key off this, not the live aircraft_models row.",
			"hidden": false,
			"id": "bool5729103846",
			"name": "logged_complex",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "The aircraft model's high_performance flag as it was when this flight was logged — see logged_aircraft_type.",
			"hidden": false,
			"id": "bool6813024957",
			"name": "logged_high_performance",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "The aircraft model's tailwheel flag as it was when this flight was logged — see logged_aircraft_type.",
			"hidden": false,
			"id": "bool7924135068",
			"name": "logged_tailwheel",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "The aircraft model's engine_type as it was when this flight was logged — see logged_aircraft_type.",
			"hidden": false,
			"id": "select8035246179",
			"maxSelect": 1,
			"name": "logged_engine_type",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"piston",
				"turboprop",
				"jet",
				"turbine_other",
				"electric"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("text2481093756")
		collection.Fields.RemoveById("select3812904567")
		collection.Fields.RemoveById("bool5729103846")
		collection.Fields.RemoveById("bool6813024957")
		collection.Fields.RemoveById("bool7924135068")
		collection.Fields.RemoveById("select8035246179")

		return app.Save(collection)
	})
}
