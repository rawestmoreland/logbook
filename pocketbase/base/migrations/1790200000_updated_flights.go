package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Collapses `route_from`/`route_to` into the single `route` field: the
// flights table now carries one free-text route (e.g. "KPAO KMRY" or a
// multi-stop "KPAO KSQL KHWD KPAO") instead of separate departure/arrival
// columns. `route` becomes required — it's the only place a flight's route
// is recorded now, where before a blank route was fine as long as
// route_from/route_to were set. See route.ts's parseRouteIdents/
// routeEndpoints for how callers derive a departure/arrival pair or a
// waypoint list from it.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("text341811445") // route_from
		collection.Fields.RemoveById("text1548878194") // route_to

		// update field: route -> required, min 1
		if err := collection.Fields.AddMarshaledJSONAt(4, []byte(`{
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
	}, func(app core.App) error {
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
	})
}
