package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Re-adds route_from/route_to and makes route optional again, undoing
// 1790200000_updated_flights (deleted from this repo, but that alone only
// stops it from running on a *fresh* database — an instance that already
// applied it before the deletion has it recorded as run and won't revert
// it on its own). AddMarshaledJSONAt upserts by field id, so this is safe
// to run against either: a database that already dropped route_from/
// route_to (this restores them) or one that never did (this is a no-op
// replace with identical field definitions).
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(4, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text341811445",
			"max": 0,
			"min": 0,
			"name": "route_from",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text1548878194",
			"max": 0,
			"min": 0,
			"name": "route_to",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text2891037465",
			"max": 500,
			"min": 0,
			"name": "route",
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
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("text341811445") // route_from
		collection.Fields.RemoveById("text1548878194") // route_to

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text2891037465",
			"max": 500,
			"min": 1,
			"name": "route",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": true,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
