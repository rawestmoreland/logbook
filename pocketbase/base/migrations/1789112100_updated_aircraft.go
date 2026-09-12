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

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"cascadeDelete": false,
			"collectionId": "_pb_users_auth_",
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

		// update collection data (scope aircraft to their owner)
		if err := json.Unmarshal([]byte(`{
			"createRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"updateRule": "@request.auth.id != \"\" && user = @request.auth.id",
			"viewRule": "@request.auth.id != \"\" && user = @request.auth.id"
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("relation2375276106")

		// update collection data (restore pre-ownership rules)
		if err := json.Unmarshal([]byte(`{
			"createRule": "@request.auth.id != \"\"",
			"deleteRule": "",
			"listRule": "@request.auth.id != \"\"",
			"updateRule": null,
			"viewRule": "@request.auth.id != \"\""
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
