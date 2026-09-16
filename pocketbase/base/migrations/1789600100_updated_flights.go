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
			"autogeneratePattern": "",
			"help": "24-hour HH:MM duty report time — see duty.ts. Blank for every pilot except the airline profile.",
			"hidden": false,
			"id": "text2891736450",
			"max": 5,
			"min": 0,
			"name": "report_time",
			"pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(24, []byte(`{
			"autogeneratePattern": "",
			"help": "24-hour HH:MM duty release time — see duty.ts. Blank for every pilot except the airline profile.",
			"hidden": false,
			"id": "text3298471069",
			"max": 5,
			"min": 0,
			"name": "release_time",
			"pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
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
		collection.Fields.RemoveById("text2891736450")

		// remove field
		collection.Fields.RemoveById("text3298471069")

		return app.Save(collection)
	})
}
