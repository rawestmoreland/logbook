package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Hardens the flights collection: pilot/aircraft/date become required (every
// flight fundamentally needs them), and every numeric/hours/landings field
// (including the three added in the previous migration) gets a `min: 0` —
// non-negative, but still not required, matching PocketBase's existing
// default of 0 for an omitted number field. Previously every field on this
// collection was `required: false, min: null, max: null`, so only the web
// client's zod schema stopped bad data — the CSV importer and any direct API
// call bypassed it entirely.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// update field: pilot -> required
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"cascadeDelete": true,
			"collectionId": "pbc_2851445954",
			"help": "",
			"hidden": false,
			"id": "relation2367577938",
			"maxSelect": 0,
			"minSelect": 0,
			"name": "pilot",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// update field: aircraft -> required
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_1402421040",
			"help": "",
			"hidden": false,
			"id": "relation333014825",
			"maxSelect": 0,
			"minSelect": 0,
			"name": "aircraft",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		// update field: date -> required
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"help": "",
			"hidden": false,
			"id": "date2862495610",
			"max": "",
			"min": "",
			"name": "date",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// update field: total_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(6, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number294390712",
			"max": null,
			"min": 0,
			"name": "total_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: pic_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2913936760",
			"max": null,
			"min": 0,
			"name": "pic_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: sic_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(8, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number589308571",
			"max": null,
			"min": 0,
			"name": "sic_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: dual_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(9, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2773667009",
			"max": null,
			"min": 0,
			"name": "dual_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: solo_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(10, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1741413876",
			"max": null,
			"min": 0,
			"name": "solo_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: night_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(11, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3660812542",
			"max": null,
			"min": 0,
			"name": "night_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: actual_instrument -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(12, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number92748921",
			"max": null,
			"min": 0,
			"name": "actual_instrument",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: sim_instrument -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(13, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1281194560",
			"max": null,
			"min": 0,
			"name": "sim_instrument",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: day_landings -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1970419282",
			"max": null,
			"min": 0,
			"name": "day_landings",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: night_landings -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(15, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3893486624",
			"max": null,
			"min": 0,
			"name": "night_landings",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: approaches -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(19, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2220428698",
			"max": null,
			"min": 0,
			"name": "approaches",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: day_landings_full_stop -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(22, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1339896564",
			"max": null,
			"min": 0,
			"name": "day_landings_full_stop",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: cross_country_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(23, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3247190581",
			"max": null,
			"min": 0,
			"name": "cross_country_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: dual_given_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(24, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number4108562937",
			"max": null,
			"min": 0,
			"name": "dual_given_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// update field: ground_sim_time -> min 0
		if err := collection.Fields.AddMarshaledJSONAt(25, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1862034795",
			"max": null,
			"min": 0,
			"name": "ground_sim_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"cascadeDelete": true,
			"collectionId": "pbc_2851445954",
			"help": "",
			"hidden": false,
			"id": "relation2367577938",
			"maxSelect": 0,
			"minSelect": 0,
			"name": "pilot",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"cascadeDelete": false,
			"collectionId": "pbc_1402421040",
			"help": "",
			"hidden": false,
			"id": "relation333014825",
			"maxSelect": 0,
			"minSelect": 0,
			"name": "aircraft",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "relation"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"help": "",
			"hidden": false,
			"id": "date2862495610",
			"max": "",
			"min": "",
			"name": "date",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(6, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number294390712",
			"max": null,
			"min": null,
			"name": "total_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2913936760",
			"max": null,
			"min": null,
			"name": "pic_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(8, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number589308571",
			"max": null,
			"min": null,
			"name": "sic_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(9, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2773667009",
			"max": null,
			"min": null,
			"name": "dual_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(10, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1741413876",
			"max": null,
			"min": null,
			"name": "solo_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(11, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3660812542",
			"max": null,
			"min": null,
			"name": "night_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(12, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number92748921",
			"max": null,
			"min": null,
			"name": "actual_instrument",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(13, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1281194560",
			"max": null,
			"min": null,
			"name": "sim_instrument",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1970419282",
			"max": null,
			"min": null,
			"name": "day_landings",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(15, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3893486624",
			"max": null,
			"min": null,
			"name": "night_landings",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(19, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number2220428698",
			"max": null,
			"min": null,
			"name": "approaches",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(22, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1339896564",
			"max": null,
			"min": null,
			"name": "day_landings_full_stop",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(23, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3247190581",
			"max": null,
			"min": null,
			"name": "cross_country_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(24, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number4108562937",
			"max": null,
			"min": null,
			"name": "dual_given_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(25, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1862034795",
			"max": null,
			"min": null,
			"name": "ground_sim_time",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
