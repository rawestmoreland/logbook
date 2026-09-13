package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The `airports` collection is public-domain reference data from OurAirports
// (see pocketbase/base/commands/seed_airports.go), not user data — it carries
// no `user` relation, no `deleted` tombstone, and is never touched by
// WatermelonDB's synchronize(). Clients query it directly.
func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
			{
				"createRule": null,
				"deleteRule": null,
				"fields": [
					{
						"autogeneratePattern": "[a-z0-9]{15}",
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
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text1128704687",
						"max": 10,
						"min": 1,
						"name": "ident",
						"pattern": "",
						"presentable": true,
						"primaryKey": false,
						"required": true,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text2827398410",
						"max": 4,
						"min": 0,
						"name": "icao",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text3641029571",
						"max": 3,
						"min": 0,
						"name": "iata",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"hidden": false,
						"id": "select4093881027",
						"maxSelect": 1,
						"name": "type",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "select",
						"values": [
							"large_airport",
							"medium_airport",
							"small_airport",
							"heliport",
							"seaplane_base",
							"balloonport"
						]
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text2711648980",
						"max": 0,
						"min": 1,
						"name": "name",
						"pattern": "",
						"presentable": true,
						"primaryKey": false,
						"required": true,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text3416057225",
						"max": 0,
						"min": 0,
						"name": "municipality",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text873692189",
						"max": 2,
						"min": 0,
						"name": "country",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "text3958604412",
						"max": 10,
						"min": 0,
						"name": "region",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"hidden": false,
						"id": "number2792003700",
						"max": 90,
						"min": -90,
						"name": "lat",
						"onlyInt": false,
						"presentable": false,
						"required": false,
						"system": false,
						"type": "number"
					},
					{
						"hidden": false,
						"id": "number1826527811",
						"max": 180,
						"min": -180,
						"name": "lon",
						"onlyInt": false,
						"presentable": false,
						"required": false,
						"system": false,
						"type": "number"
					},
					{
						"hidden": false,
						"id": "number601852704",
						"max": null,
						"min": null,
						"name": "elevation_ft",
						"onlyInt": true,
						"presentable": false,
						"required": false,
						"system": false,
						"type": "number"
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
				"id": "pbc_3910284756",
				"indexes": [
					"CREATE UNIQUE INDEX ` + "`" + `idx_airports_ident` + "`" + ` ON ` + "`" + `airports` + "`" + ` (` + "`" + `ident` + "`" + `)",
					"CREATE INDEX ` + "`" + `idx_airports_icao` + "`" + ` ON ` + "`" + `airports` + "`" + ` (` + "`" + `icao` + "`" + ` COLLATE NOCASE)",
					"CREATE INDEX ` + "`" + `idx_airports_iata` + "`" + ` ON ` + "`" + `airports` + "`" + ` (` + "`" + `iata` + "`" + ` COLLATE NOCASE)",
					"CREATE INDEX ` + "`" + `idx_airports_name` + "`" + ` ON ` + "`" + `airports` + "`" + ` (` + "`" + `name` + "`" + ` COLLATE NOCASE)",
					"CREATE INDEX ` + "`" + `idx_airports_municipality` + "`" + ` ON ` + "`" + `airports` + "`" + ` (` + "`" + `municipality` + "`" + ` COLLATE NOCASE)"
				],
				"listRule": "",
				"name": "airports",
				"system": false,
				"type": "base",
				"updateRule": null,
				"viewRule": ""
			}
		]`

		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_3910284756")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
