package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds starting-totals support to the flights collection: a pilot migrating
// from a paper logbook or another app can carry forward their pre-app
// totals as one special row, flagged `is_starting_totals`, rather than a
// parallel data model. That row has no real aircraft (nothing was actually
// flown in it), so `aircraft` goes back to optional — the app layer
// (createFlight/updateFlight's flightFormSchema) still requires it for an
// ordinary logged flight; only the dedicated starting-totals server
// function creates a row without one. A partial unique index enforces "at
// most one starting-totals row per pilot" at the database level, since it's
// a single carry-forward snapshot, not a log of edits.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX `+"`"+`idx_flights_one_starting_totals_per_pilot`+"`"+` ON `+"`"+`flights`+"`"+` (`+"`"+`pilot`+"`"+`) WHERE `+"`"+`is_starting_totals`+"`"+` = true"
			]
		}`), &collection); err != nil {
			return err
		}

		// update field: aircraft -> no longer required (a starting-totals
		// row has none)
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_1402421040",
			"help": "",
			"hidden": false,
			"id": "relation333014825",
			"maxSelect": 0,
			"minSelect": 0,
			"name": "aircraft",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(26, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool1096196554",
			"name": "is_starting_totals",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": []
		}`), &collection); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_1402421040",
			"help": "",
			"hidden": false,
			"id": "relation333014825",
			"maxSelect": 0,
			"minSelect": 0,
			"name": "aircraft",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("bool1096196554")

		return app.Save(collection)
	})
}
