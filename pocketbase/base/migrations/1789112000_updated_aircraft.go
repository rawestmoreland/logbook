package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("text91772630")

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"hidden": false,
			"id": "select91772630",
			"maxSelect": 1,
			"name": "category_class",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"airplane_single_engine_land",
				"airplane_multi_engine_land",
				"airplane_single_engine_sea",
				"airplane_multi_engine_sea",
				"rotorcraft_helicopter",
				"rotorcraft_gyroplane",
				"glider",
				"lighter_than_air_airship",
				"lighter_than_air_balloon",
				"powered_lift",
				"powered_parachute_land",
				"powered_parachute_sea",
				"weight_shift_control_land",
				"weight_shift_control_sea"
			]
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("select91772630")

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text91772630",
			"max": 0,
			"min": 0,
			"name": "category_class",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
