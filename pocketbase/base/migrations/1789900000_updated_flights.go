package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds a free-text `route` field to the flights collection: a full
// multi-stop route string (e.g. "KPAO KSQL KHWD KPAO"), as ForeFlight's own
// "Route" CSV column and many logbook exports carry, distinct from
// route_from/route_to (which only capture the flight's first and last
// points). Check Flights' cross-country distance rule reads it — falling
// back to just route_from/route_to when it's blank, see route.ts's
// routeWaypointIdents — to resolve every waypoint on the route, not just
// the endpoints, before measuring the farthest one from the origin.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// A large position value appends the field rather than inserting
		// it somewhere specific — AddMarshaledJSONAt clamps any position
		// past the current field count to the end of the list.
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

		collection.Fields.RemoveById("text2891037465")

		return app.Save(collection)
	})
}
