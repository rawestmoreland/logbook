package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// aircraft_models/manufacturers are a shared, community-grown catalog with
// no updateRule for regular pilots (see the manufacturers/aircraft_models
// migrations) — a pilot who spots a typo'd or misclassified model today has
// no way to flag it. This collection is that flag: any pilot can report a
// problem with a model, superusers triage it from the admin UI (there's no
// admin-notification email flow in this codebase yet — see
// aircraft_notifications.go's pilot-to-pilot pattern — so this is a queue,
// not a push), and the reporter can see their own reports' status. Mirrors
// MyFlightbook's "report a problem with this aircraft" flow.
func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"createRule": "@request.auth.id != \"\" && reported_by = @request.auth.id && status = \"open\"",
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
					"collectionId": "pbc_4197752044",
					"help": "",
					"hidden": false,
					"id": "relation2183746510",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "model",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"cascadeDelete": false,
					"collectionId": "_pb_users_auth_",
					"help": "",
					"hidden": false,
					"id": "relation3846271059",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "reported_by",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"help": "",
					"hidden": false,
					"id": "select1928475603",
					"maxSelect": 1,
					"name": "reason",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "select",
					"values": [
						"wrong_manufacturer",
						"wrong_model_or_common_name",
						"wrong_category_class",
						"wrong_equipment_or_avionics",
						"duplicate_of_another_model",
						"other"
					]
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text4756392018",
					"max": 2000,
					"min": 0,
					"name": "details",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"help": "",
					"hidden": false,
					"id": "select5647382910",
					"maxSelect": 1,
					"name": "status",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "select",
					"values": [
						"open",
						"resolved",
						"dismissed"
					]
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
			"id": "pbc_3611980221",
			"indexes": [],
			"listRule": "@request.auth.id != \"\" && reported_by = @request.auth.id",
			"name": "aircraft_model_reports",
			"system": false,
			"type": "base",
			"updateRule": null,
			"viewRule": "@request.auth.id != \"\" && reported_by = @request.auth.id"
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_3611980221")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
