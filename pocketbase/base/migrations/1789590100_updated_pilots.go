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
		if err := collection.Fields.AddMarshaledJSONAt(13, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_3133624946",
			"help": "Which jurisdiction's currency rules apply to this pilot. Not required — empty resolves to FAA, the same way an empty medical_pathway already resolves to the traditional certificate ladder.",
			"hidden": false,
			"id": "relation4108273659",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "regulatory_profile",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"help": "EASA Part-MED certificate class. Only meaningful when regulatory_profile resolves to EASA; the traditional FAA ladder uses medical_class instead.",
			"hidden": false,
			"id": "select7284910365",
			"maxSelect": 1,
			"name": "easa_medical_class",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"lapl",
				"class2"
			]
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(15, []byte(`{
			"help": "EASA Part-MED medical certificate issue date (MED.A.045). birthdate is shared with the FAA fields above rather than duplicated.",
			"hidden": false,
			"id": "date5019283746",
			"max": "",
			"min": "",
			"name": "easa_medical_issued",
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
		collection.Fields.RemoveById("relation4108273659")

		// remove field
		collection.Fields.RemoveById("select7284910365")

		// remove field
		collection.Fields.RemoveById("date5019283746")

		return app.Save(collection)
	})
}
