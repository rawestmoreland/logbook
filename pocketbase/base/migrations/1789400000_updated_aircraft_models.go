package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds the three FAA-defined components of "complex" (14 CFR 61.31(e)) as
// their own fields, so the aircraft_models validation hook (see
// hooks/aircraft_models.go) can require them individually instead of trusting
// a single complex checkbox: retractable landing gear, a controllable pitch
// propeller, and flaps (seaplanes are exempt from the gear requirement).
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(8, []byte(`{
			"help": "14 CFR 61.31(e): required for complex, except seaplanes.",
			"hidden": false,
			"id": "bool1462738495",
			"name": "retractable_gear",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(9, []byte(`{
			"help": "14 CFR 61.31(e): required for complex.",
			"hidden": false,
			"id": "bool2864950173",
			"name": "controllable_pitch_prop",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(10, []byte(`{
			"help": "14 CFR 61.31(e): required for complex.",
			"hidden": false,
			"id": "bool3971582604",
			"name": "flaps",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("bool1462738495")
		collection.Fields.RemoveById("bool2864950173")
		collection.Fields.RemoveById("bool3971582604")

		return app.Save(collection)
	})
}
