package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"createRule": "@request.auth.id != \"\"",
			"deleteRule": null,
			"fields": [
				{
					"autogeneratePattern": "[a-z0-9]{15}",
					"help": "",
					"hidden": false,
					"id": "text3208210256",
					"max": 15,
					"min": 15,
					"name": "id",
					"pattern": "^[a-z0-9]+$",
					"presentable": false,
					"primaryKey": true,
					"required": true,
					"system": true,
					"type": "text"
				},
				{
					"cascadeDelete": false,
					"collectionId": "pbc_2103600739",
					"help": "",
					"hidden": false,
					"id": "relation1024124636",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "manufacturer",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text3616895705",
					"max": 0,
					"min": 1,
					"name": "model",
					"pattern": "",
					"presentable": true,
					"primaryKey": false,
					"required": true,
					"system": false,
					"type": "text"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text4005258903",
					"max": 0,
					"min": 0,
					"name": "common_name",
					"pattern": "",
					"presentable": true,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"help": "",
					"hidden": false,
					"id": "select91772630",
					"maxSelect": 1,
					"name": "category_class",
					"presentable": false,
					"required": true,
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
				},
				{
					"help": "",
					"hidden": false,
					"id": "bool3549721409",
					"name": "complex",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "bool"
				},
				{
					"help": "",
					"hidden": false,
					"id": "bool2298136027",
					"name": "high_performance",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "bool"
				},
				{
					"help": "",
					"hidden": false,
					"id": "bool2448275500",
					"name": "tailwheel",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "bool"
				},
				{
					"hidden": false,
					"id": "autodate2990389176",
					"name": "created",
					"onCreate": true,
					"onUpdate": false,
					"presentable": false,
					"system": false,
					"type": "autodate"
				},
				{
					"hidden": false,
					"id": "autodate3332085495",
					"name": "updated",
					"onCreate": true,
					"onUpdate": true,
					"presentable": false,
					"system": false,
					"type": "autodate"
				}
			],
			"id": "pbc_4197752044",
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_aircraft_models_manufacturer_model` + "`" + ` ON ` + "`" + `aircraft_models` + "`" + ` (` + "`" + `manufacturer` + "`" + `, ` + "`" + `model` + "`" + ` COLLATE NOCASE)"
			],
			"listRule": "@request.auth.id != \"\"",
			"name": "aircraft_models",
			"system": false,
			"type": "base",
			"updateRule": null,
			"viewRule": "@request.auth.id != \"\""
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
