package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(23, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3247190581",
			"max": null,
			"min": null,
			"name": "cross_country_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(24, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number4108562937",
			"max": null,
			"min": null,
			"name": "dual_given_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(25, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1862034795",
			"max": null,
			"min": null,
			"name": "ground_sim_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("number3247190581")

		// remove field
		collection.Fields.RemoveById("number4108562937")

		// remove field
		collection.Fields.RemoveById("number1862034795")

		return app.Save(collection)
	})
}
