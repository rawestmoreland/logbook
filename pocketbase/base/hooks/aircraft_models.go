// Package hooks holds custom PocketBase record hooks for this backend.
package hooks

import (
	"github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// seaplaneCategoryClasses are the aircraft_models category_class values that
// 14 CFR 61.31(e) exempts from the retractable landing gear requirement for
// "complex" — flaps and a controllable pitch propeller still apply. Mirrors
// the seaplane entries of CATEGORY_CLASSES in packages/core/src/aircraft.ts
// and validAircraftCategoryClasses in commands/seed_aircraft.go.
var seaplaneCategoryClasses = map[string]bool{
	"airplane_single_engine_sea": true,
	"airplane_multi_engine_sea":  true,
}

// RegisterAircraftModelHooks enforces the FAA's definition of "complex"
// (14 CFR 61.31(e)) on the aircraft_models collection: a model can't be
// marked complex unless it actually has the equipment the definition
// requires — flaps and a controllable pitch propeller always, plus
// retractable landing gear except for seaplanes. retractable_gear,
// controllable_pitch_prop, and flaps remain independently settable (e.g. an
// aircraft can have flaps without being complex), this only constrains what
// complex requires of them.
func RegisterAircraftModelHooks(app core.App) {
	app.OnRecordValidate("aircraft_models").BindFunc(func(e *core.RecordEvent) error {
		if !e.Record.GetBool("complex") {
			return e.Next()
		}

		isSeaplane := seaplaneCategoryClasses[e.Record.GetString("category_class")]

		errs := validation.Errors{}
		if !e.Record.GetBool("flaps") {
			errs["flaps"] = validation.NewError(
				"validation_complex_requires_flaps",
				"Complex aircraft must have flaps.",
			)
		}
		if !e.Record.GetBool("controllable_pitch_prop") {
			errs["controllable_pitch_prop"] = validation.NewError(
				"validation_complex_requires_controllable_pitch_prop",
				"Complex aircraft must have a controllable pitch propeller.",
			)
		}
		if !isSeaplane && !e.Record.GetBool("retractable_gear") {
			errs["retractable_gear"] = validation.NewError(
				"validation_complex_requires_retractable_gear",
				"Complex aircraft must have retractable landing gear (seaplanes are exempt).",
			)
		}

		if len(errs) > 0 {
			return errs
		}

		return e.Next()
	})
}
