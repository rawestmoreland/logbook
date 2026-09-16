package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(16, []byte(`{
			"help": "Which data set personalizes the home screen: 'airline' surfaces turbine PIC time and duty/rest, 'recreational' surfaces passenger and instrument currency. Empty resolves to 'recreational', the same fail-safe-default convention as an empty regulatory_profile resolving to FAA.",
			"hidden": false,
			"id": "select3298104175",
			"maxSelect": 1,
			"name": "profile_type",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"recreational",
				"airline"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("select3298104175")

		return app.Save(collection)
	})
}
