package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"createRule": "@request.auth.id != \"\" && flight.pilot.user = @request.auth.id",
			"deleteRule": "@request.auth.id != \"\" && flight.pilot.user = @request.auth.id",
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
					"collectionId": "pbc_1831324160",
					"help": "",
					"hidden": false,
					"id": "relation3260540430",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "flight",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text1928374655",
					"max": 64,
					"min": 1,
					"name": "code",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": true,
					"system": false,
					"type": "text"
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
			"id": "pbc_2938471603",
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_ignored_checks_flight_code` + "`" + ` ON ` + "`" + `ignored_checks` + "`" + ` (` + "`" + `flight` + "`" + `, ` + "`" + `code` + "`" + `)"
			],
			"listRule": "@request.auth.id != \"\" && flight.pilot.user = @request.auth.id",
			"name": "ignored_checks",
			"system": false,
			"type": "base",
			"updateRule": null,
			"viewRule": "@request.auth.id != \"\" && flight.pilot.user = @request.auth.id"
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2938471603")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
