package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// aircraft and regulatory_profiles were left with null list/view rules
// (superusers only) from the initial snapshot — every other reference
// collection with the same "readable by any signed-in pilot" shape
// (manufacturers, aircraft_models) already grants
// `@request.auth.id != ""`. With the rule left null, PocketBase silently
// drops the `regulatory_profile`/`aircraft` expand for ordinary users
// instead of erroring, which crashed /profile, /currency and every route
// that expands through `aircraft` (flights, analysis, import,
// endorsements) once running against a deploy whose migrations hadn't
// picked up a rule fix made only via the local admin UI.
func init() {
	m.Register(func(app core.App) error {
		aircraft, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}
		authRule := "@request.auth.id != \"\""
		aircraft.ListRule = &authRule
		aircraft.ViewRule = &authRule
		if err := app.Save(aircraft); err != nil {
			return err
		}

		regulatoryProfiles, err := app.FindCollectionByNameOrId("pbc_3133624946")
		if err != nil {
			return err
		}
		regulatoryProfiles.ListRule = &authRule
		regulatoryProfiles.ViewRule = &authRule
		return app.Save(regulatoryProfiles)
	}, func(app core.App) error {
		aircraft, err := app.FindCollectionByNameOrId("pbc_1402421040")
		if err != nil {
			return err
		}
		aircraft.ListRule = nil
		aircraft.ViewRule = nil
		if err := app.Save(aircraft); err != nil {
			return err
		}

		regulatoryProfiles, err := app.FindCollectionByNameOrId("pbc_3133624946")
		if err != nil {
			return err
		}
		regulatoryProfiles.ListRule = nil
		regulatoryProfiles.ViewRule = nil
		return app.Save(regulatoryProfiles)
	})
}
