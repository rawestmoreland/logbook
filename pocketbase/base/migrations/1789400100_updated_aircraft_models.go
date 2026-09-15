package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds minimum_avionics and engine_type to aircraft_models, mirroring
// MyFlightbook's model-level avionics/engine classification.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(11, []byte(`{
			"help": "",
			"hidden": false,
			"id": "select4092857361",
			"maxSelect": 1,
			"name": "minimum_avionics",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"non_glass",
				"glass_pfd",
				"glass_panel_taa"
			]
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(12, []byte(`{
			"help": "",
			"hidden": false,
			"id": "select7261849305",
			"maxSelect": 1,
			"name": "engine_type",
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
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("select4092857361")
		collection.Fields.RemoveById("select7261849305")

		return app.Save(collection)
	})
}
