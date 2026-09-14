package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"createRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"deleteRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
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
					"cascadeDelete": true,
					"collectionId": "pbc_2851445954",
					"help": "",
					"hidden": false,
					"id": "relation2367577938",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "pilot",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"cascadeDelete": false,
					"collectionId": "pbc_1402421040",
					"help": "",
					"hidden": false,
					"id": "relation333014825",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "aircraft",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"help": "",
					"hidden": false,
					"id": "bool3946532403",
					"name": "deleted",
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
			"id": "pbc_1604272081",
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_pilot_aircraft_pilot_aircraft` + "`" + ` ON ` + "`" + `pilot_aircraft` + "`" + ` (` + "`" + `pilot` + "`" + `, ` + "`" + `aircraft` + "`" + `)"
			],
			"listRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"name": "pilot_aircraft",
			"system": false,
			"type": "base",
			"updateRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"viewRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id"
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1604272081")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
