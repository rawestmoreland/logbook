package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds `type_design_designator` — the FAA/Transport Canada Type Certificate
// Data Sheet model number (e.g. "CL-600-2B19" for the CRJ 200), independent
// of `model`. Before this, aircraft-model-aliases.ts's CRJ entries had
// nowhere else to put that code except `model` itself, leaving `common_name`
// to carry the marketing name ("CRJ 200") — workable, but it meant a
// catalog row's `model` field meant two different things depending on which
// aircraft you were looking at (a Cessna 172S's `model` is the
// manufacturer's own model number; a CRJ's `model` was standing in for its
// type certificate number instead). This field gives the TC number its own
// home so `model`/`common_name` can consistently mean the same thing across
// every row, and so searching/matching can target the TC number directly
// without it having hijacked `model`.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"autogeneratePattern": "",
			"help": "FAA/Transport Canada Type Certificate Data Sheet model number (e.g. CL-600-2B19), when it differs from the model's common name.",
			"hidden": false,
			"id": "text3182647591",
			"max": 0,
			"min": 0,
			"name": "type_design_designator",
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
		collection, err := app.FindCollectionByNameOrId("pbc_4197752044")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("text3182647591")

		return app.Save(collection)
	})
}
