package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds pilots.notify_aircraft_changes (issue #76): whether to email this
// pilot when an aircraft they've flown is reclassified in a way that leaves
// some of their logged flights drifted from its current model data (see
// hooks/aircraft_notifications.go). A bool column's zero value is false, so
// "defaults to true" can't be expressed in the field schema itself — instead
// every existing pilot is backfilled to true here, and
// findOrCreatePilotRecord (apps/web/src/lib/server/pilots.ts) sets it
// explicitly on every new pilot record going forward.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"hidden": false,
			"id": "bool9174623805",
			"help": "Whether to email this pilot when an aircraft they've flown is reclassified (issue #76). Defaults to true for every pilot — see this migration's doc comment.",
			"name": "notify_aircraft_changes",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		pilots, err := app.FindAllRecords("pilots")
		if err != nil {
			return err
		}
		for _, pilot := range pilots {
			pilot.Set("notify_aircraft_changes", true)
			if err := app.SaveNoValidate(pilot); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("bool9174623805")

		return app.Save(collection)
	})
}
