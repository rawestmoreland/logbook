package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Reworks how landings are recorded on the flights collection, to match
// MyFlightbook's UI convention (total / day full stop / night full stop)
// instead of the previous day/night split that conflated "all day landings"
// with "night landings" (implicitly full stop):
//
//   - day_landings (all day landings, touch-and-go included) and
//     night_landings (full-stop night landings) are replaced by a single
//     total_landings field.
//   - night_landings is renamed to night_landings_full_stop — its data
//     already meant "full-stop landings at night", so no value transform is
//     needed there, just the name.
//   - day_landings_full_stop is untouched.
//
// Existing rows are migrated by SQL before the day_landings field is renamed:
// total_landings = day_landings + night_landings, i.e. the same total the UI
// already showed as "Landings" (see index.tsx's Lndgs column).
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_1831324160")
		if err != nil {
			return err
		}

		// Fold night_landings into day_landings before renaming it, so the
		// data survives the rename as the new field's total.
		if _, err := app.DB().NewQuery(
			"UPDATE flights SET day_landings = day_landings + night_landings",
		).Execute(); err != nil {
			return err
		}

		// rename field: day_landings -> total_landings (same id, now holds
		// the pre-summed total from the query above)
		if err := collection.Fields.AddMarshaledJSONAt(14, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number1970419282",
			"max": null,
			"min": 0,
			"name": "total_landings",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// rename field: night_landings -> night_landings_full_stop (data
		// already meant full-stop night landings, no transform needed)
		if err := collection.Fields.AddMarshaledJSONAt(15, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3893486624",
			"max": null,
			"min": 0,
			"name": "night_landings_full_stop",
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

		if err := app.Save(collection); err != nil {
			return err
		}

		// Recover the pre-migration day_landings figure now that the fields
		// are renamed back: day_landings = total_landings - night_landings.
		// Not a perfect inverse (a night touch-and-go, which this app never
		// tracked separately, would have been folded into the total and
		// comes back out as a "day" landing), but consistent with how the
		// up migration derived the total in the first place.
		_, err = app.DB().NewQuery(
			"UPDATE flights SET day_landings = day_landings - night_landings",
		).Execute()
		return err
	})
}
