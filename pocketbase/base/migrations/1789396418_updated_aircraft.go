package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"createRule": "@request.auth.id != \"\"",
			"deleteRule": null,
			"indexes": [
				"CREATE UNIQUE INDEX ` + "`" + `idx_aircraft_tail_number` + "`" + ` ON ` + "`" + `aircraft` + "`" + ` (` + "`" + `tail_number` + "`" + `)"
			],
			"listRule": "@request.auth.id != \"\"",
			"updateRule": null,
			"viewRule": "@request.auth.id != \"\""
		}`), &collection); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation2375276106")

		// remove field
		collection.Fields.RemoveById("text2363381545")

		// remove field
		collection.Fields.RemoveById("select91772630")

		// remove field
		collection.Fields.RemoveById("bool3549721409")

		// remove field
		collection.Fields.RemoveById("bool2298136027")

		// remove field
		collection.Fields.RemoveById("bool2448275500")

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_4197752044",
			"help": "",
			"hidden": false,
			"id": "relation3616895705",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "model",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"help": "",
			"hidden": false,
			"id": "select2765359074",
			"maxSelect": 1,
			"name": "instance_type",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "select",
			"values": [
				"real",
				"uncertified_sim",
				"certified_ifr_sim",
				"certified_ifr_landings_sim",
				"certified_atd"
			]
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text2652002929",
			"max": 0,
			"min": 1,
			"name": "tail_number",
			"pattern": "",
			"presentable": true,
			"primaryKey": false,
			"required": true,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"createRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"indexes": [],
			"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"updateRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"viewRule": "@request.auth.id != \"\" && user = @request.auth.id"
		}`), &collection); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"cascadeDelete": false,
			"collectionId": "_pb_users_auth_",
			"help": "",
			"hidden": false,
			"id": "relation2375276106",
			"maxSelect": 1,
			"minSelect": 0,
			"name": "user",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text2363381545",
			"max": 0,
			"min": 0,
			"name": "type",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(4, []byte(`{
			"help": "",
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

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool3549721409",
			"name": "complex",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(6, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool2298136027",
			"name": "high_performance",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"help": "",
			"hidden": false,
			"id": "bool2448275500",
			"name": "tailwheel",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation3616895705")

		// remove field
		collection.Fields.RemoveById("select2765359074")

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text2652002929",
			"max": 0,
			"min": 0,
			"name": "tail_number",
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
