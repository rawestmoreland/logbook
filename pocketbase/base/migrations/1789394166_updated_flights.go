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
		if err := collection.Fields.AddMarshaledJSONAt(19, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2220428698",
			"max": null,
			"min": null,
			"name": "approaches",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(20, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool742512417",
			"name": "holding",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(21, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool403438882",
			"name": "course_tracking",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(22, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1339896564",
			"max": null,
			"min": null,
			"name": "day_landings_full_stop",
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
		collection.Fields.RemoveById("number2220428698")

		// remove field
		collection.Fields.RemoveById("bool742512417")

		// remove field
		collection.Fields.RemoveById("bool403438882")

		// remove field
		collection.Fields.RemoveById("number1339896564")

		return app.Save(collection)
	})
}
