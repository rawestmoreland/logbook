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
		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"help": "",
			"hidden": false,
			"id": "select1593505169",
			"maxSelect": 1,
			"name": "medical_class",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"first",
				"second",
				"third"
			]
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(6, []byte(`{
			"help": "",
			"hidden": false,
			"id": "date3326591226",
			"max": "",
			"min": "",
			"name": "medical_issued",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"help": "",
			"hidden": false,
			"id": "date3613984066",
			"max": "",
			"min": "",
			"name": "birthdate",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
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
		collection.Fields.RemoveById("select1593505169")

		// remove field
		collection.Fields.RemoveById("date3326591226")

		// remove field
		collection.Fields.RemoveById("date3613984066")

		return app.Save(collection)
	})
}
