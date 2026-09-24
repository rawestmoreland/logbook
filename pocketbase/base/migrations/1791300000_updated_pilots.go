package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds pilots.is_admin (issue #92): the app-level admin flag gating the new
// /admin catalog-merge tooling in apps/web and the /api/admin/* Go routes
// (pocketbase/base/api/admin.go). There's no existing admin-role concept in
// this codebase — only PocketBase's own superuser auth, which is a separate
// collection from pilots/users and only reachable through the admin UI, not
// something apps/web can check a signed-in pilot's session against. Defaults
// to false (a bool column's zero value) for every pilot, existing and new;
// set manually per pilot via the PocketBase admin UI, same as any other
// superuser-only field.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"hidden": false,
			"id": "bool6392017485",
			"help": "Grants access to the /admin catalog-merge tooling. Set manually via the PocketBase admin UI — there's no in-app way to grant it.",
			"name": "is_admin",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("bool6392017485")

		return app.Save(collection)
	})
}
