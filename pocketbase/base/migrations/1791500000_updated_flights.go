package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds flights.properties — custom flight properties (MyFlightbook parity,
// "Flight Properties v1"). A bare json field holding an array of
// {"propertyId": "<slug>", "value": "<string>"} entries, the same
// shape-in-a-json-column approach pilots.licenses uses, rather than an
// EAV collection + relation. The catalog of valid propertyIds and each one's
// value type is a fixed list in packages/core/src/flight-properties.ts;
// validation happens there (flightFormSchema), not in the database.
//
// PocketBase json fields have no column default, so existing rows read back
// as null rather than []; parseStoredFlightProperties in @logbook/core
// treats null as "no properties". Left optional here for the same reason —
// no backfill needed.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(999, []byte(`{
			"help": "Custom flight properties: a JSON array of {propertyId, value} entries. See packages/core/src/flight-properties.ts for the catalog of valid propertyIds.",
			"hidden": false,
			"id": "json4719302856",
			"maxSize": 0,
			"name": "properties",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "json"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("json4719302856")

		return app.Save(collection)
	})
}
