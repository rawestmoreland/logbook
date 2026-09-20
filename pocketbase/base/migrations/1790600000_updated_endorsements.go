package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Tightens the previously-dead `signature` file field now that an
// unauthenticated token-holder (the CFI on a `/sign/:token` link) can write
// to it: `mimeTypes: []`/`maxSize: 0` meant "any file type, up to
// PocketBase's 5MB default" (see `core.DefaultFileFieldMaxSize`), which is
// fine for a field nobody could reach but not once a sign link is the only
// credential. `mimeTypes` is narrowed to the one format the client exports
// (`canvas.toDataURL('image/png')` in the sign form). `maxSize` is capped at
// 400000 bytes (~390KB) — a signature is simple line art on a capped-size
// canvas (~500x150 CSS px, scaled for devicePixelRatio) that should compress
// to a few KB, but this leaves an order of magnitude of headroom over that
// without accepting anywhere near the previous 5MB ceiling. Reuses field id
// `file2928148801` so it updates in place rather than adding a duplicate
// field.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_55099921")
		if err != nil {
			return err
		}

		// update fields
		if err := collection.Fields.AddMarshaledJSONAt(-1, []byte(`[
			{
				"help": "",
				"hidden": false,
				"id": "file2928148801",
				"maxSelect": 0,
				"maxSize": 400000,
				"mimeTypes": [
					"image/png"
				],
				"name": "signature",
				"presentable": false,
				"protected": false,
				"required": false,
				"system": false,
				"thumbs": [],
				"type": "file"
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

		// update fields
		if err := collection.Fields.AddMarshaledJSONAt(-1, []byte(`[
			{
				"help": "",
				"hidden": false,
				"id": "file2928148801",
				"maxSelect": 0,
				"maxSize": 0,
				"mimeTypes": [],
				"name": "signature",
				"presentable": false,
				"protected": false,
				"required": false,
				"system": false,
				"thumbs": [],
				"type": "file"
			}
		]`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
