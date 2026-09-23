package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds pilots.is_instructor and pilots.cfi_certificate_number: lets a pilot
// mark their own account as also being a CFI, so another pilot can link them
// as the `instructor` on one of their endorsements and have them sign in as
// an authenticated PocketBase user instead of only through the anonymous
// `/sign/:token` link (see endorsement-signatures.ts and
// createEndorsement's doc comment in apps/web/src/lib/server/endorsements.ts
// for the account-linking flow this unblocks). `is_instructor` defaults to
// false (a bool column's zero value), unlike notify_aircraft_changes — no
// backfill needed since every existing pilot correctly starts out not
// flagged as a CFI. `cfi_certificate_number` is self-attested, same trust
// model the token sign flow already has (no FAA registry check), and is
// only a prefilled default for a per-signature certificate number a CFI can
// still override — see signEndorsementAsInstructor.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"hidden": false,
			"id": "bool4827159301",
			"help": "Whether this pilot is also a CFI who can be linked as the instructor on another pilot's endorsement.",
			"name": "is_instructor",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "text5719283046",
			"help": "Self-attested CFI certificate number, prefilled as the default on each signature but editable per-signature.",
			"max": 0,
			"min": 0,
			"name": "cfi_certificate_number",
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
		collection, err := app.FindCollectionByNameOrId("pbc_2851445954")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("bool4827159301")
		collection.Fields.RemoveById("text5719283046")

		return app.Save(collection)
	})
}
