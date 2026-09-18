package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds pending-flight support to the flights collection: a flight from an
// import feed or a quick draft entry can be logged but held out of totals,
// currency, and the main flights list until the pilot reviews and confirms
// it (MyFlightbook's "Pending Flights"). Same pattern as is_starting_totals
// — a boolean flag on the row rather than a parallel table — defaulting to
// false so every existing flight and every ordinary new one counts as
// before.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// A large position value appends the field rather than inserting
		// it somewhere specific — AddMarshaledJSONAt clamps any position
		// past the current field count to the end of the list.
		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool4172938561",
			"name": "pending",
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

		collection.Fields.RemoveById("bool4172938561")

		return app.Save(collection)
	})
}
