package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds electronic-signature support to endorsements (issue #68): a pilot can
// request a signature on an already-logged endorsement and hand a CFI a
// single-use link (`sign_token`, opaque + unique) instead of the CFI ever
// needing an account here. `instructor_name`/`instructor_certificate_number`
// are the CFI's typed attestation (there's no drawn/image signature this
// round — the existing `signature` file field stays unused, same as
// `instructor`, the relation-to-`pilots` field). `content_hash` is computed
// by `computeEndorsementContentHash` (packages/core) over the fields that
// must not change post-signing and stored at sign time so a later edit to
// those fields is detectable. `sign_token`/`sign_token_expires` scope the
// unauthenticated sign link; the partial unique index (rather than a plain
// one) is required because unsigned endorsements leave `sign_token` at its
// zero value "", and a plain unique index would reject the second such row.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_55099921")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": [
				"CREATE UNIQUE INDEX `+"`"+`idx_endorsements_sign_token`+"`"+` ON `+"`"+`endorsements`+"`"+` (`+"`"+`sign_token`+"`"+`) WHERE `+"`"+`sign_token`+"`"+` != ''"
			]
		}`), &collection); err != nil {
			return err
		}

		// add fields
		if err := collection.Fields.AddMarshaledJSONAt(10, []byte(`[
			{
				"autogeneratePattern": "",
				"help": "CFI's typed full legal name at signing time.",
				"hidden": false,
				"id": "text2094817364",
				"max": 0,
				"min": 0,
				"name": "instructor_name",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"autogeneratePattern": "",
				"help": "",
				"hidden": false,
				"id": "text3948271605",
				"max": 0,
				"min": 0,
				"name": "instructor_certificate_number",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"help": "",
				"hidden": false,
				"id": "date5827301948",
				"max": "",
				"min": "",
				"name": "signed_at",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "date"
			},
			{
				"autogeneratePattern": "",
				"help": "computeEndorsementContentHash() over type/date/text/flight/pilot at signing time — a mismatch on redisplay means the endorsement changed after signing.",
				"hidden": false,
				"id": "text6193740285",
				"max": 0,
				"min": 0,
				"name": "content_hash",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"autogeneratePattern": "",
				"help": "Opaque single-use token embedded in the CFI-facing sign link. Left blank unless a signature has been requested.",
				"hidden": false,
				"id": "text7204639158",
				"max": 0,
				"min": 0,
				"name": "sign_token",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"help": "",
				"hidden": false,
				"id": "date8316750269",
				"max": "",
				"min": "",
				"name": "sign_token_expires",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "date"
			}
		]`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_55099921")
		if err != nil {
			return err
		}

		// update collection data
		if err := json.Unmarshal([]byte(`{
			"indexes": []
		}`), &collection); err != nil {
			return err
		}

		// remove fields
		collection.Fields.RemoveById("text2094817364")
		collection.Fields.RemoveById("text3948271605")
		collection.Fields.RemoveById("date5827301948")
		collection.Fields.RemoveById("text6193740285")
		collection.Fields.RemoveById("text7204639158")
		collection.Fields.RemoveById("date8316750269")

		return app.Save(collection)
	})
}
