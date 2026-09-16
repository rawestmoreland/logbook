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
		if err := collection.Fields.AddMarshaledJSONAt(9, []byte(`{
			"help": "14 CFR part 68 (BasicMed) is a separate pathway from the traditional first/second/third class medical certificate ladder.",
			"hidden": false,
			"id": "select2547198360",
			"maxSelect": 1,
			"name": "medical_pathway",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"certificate",
				"basicmed"
			]
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(10, []byte(`{
			"help": "Most recent BasicMed medical education course (e.g. AOPA/EAA online course) completion date.",
			"hidden": false,
			"id": "date1974583201",
			"max": "",
			"min": "",
			"name": "basicmed_course_completed",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(11, []byte(`{
			"help": "Most recent BasicMed comprehensive medical exam (CMEC) completion date.",
			"hidden": false,
			"id": "date3708291645",
			"max": "",
			"min": "",
			"name": "basicmed_exam_completed",
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
		collection.Fields.RemoveById("select2547198360")

		// remove field
		collection.Fields.RemoveById("date1974583201")

		// remove field
		collection.Fields.RemoveById("date3708291645")

		return app.Save(collection)
	})
}
