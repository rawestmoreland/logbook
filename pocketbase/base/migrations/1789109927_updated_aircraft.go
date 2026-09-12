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
			"deleteRule": "",
			"listRule": "@request.auth.id != \"\"",
			"viewRule": "@request.auth.id != \"\""
		}`), &collection); err != nil {
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
			"createRule": null,
			"deleteRule": null,
			"listRule": null,
			"viewRule": null
		}`), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
