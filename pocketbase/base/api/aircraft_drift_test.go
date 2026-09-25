package api

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// aircraftDriftFixture wires up one pilot with two aircraft: one whose model
// was corrected after the pilot's flight was logged (drifted), and one whose
// model still matches what was logged (not drifted) — enough to exercise
// aircraftDriftHandler's per-aircraft grouping and its "absent means no
// drift" contract.
type aircraftDriftFixture struct {
	app             *tests.TestApp
	token           string
	driftedAircraft *core.Record
	stableAircraft  *core.Record
}

func newAircraftDriftFixture(t testing.TB) *aircraftDriftFixture {
	t.Helper()
	app := newTestApp(t)

	user := mustCreateUser(t, app, "pilot@example.com")
	pilot := mustSave(t, app, "pilots", map[string]any{
		"user": user.Id,
		"name": "Test Pilot",
	})

	manufacturer := mustSave(t, app, "manufacturers", map[string]any{"name": "Cessna"})

	driftedModel := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   manufacturer.Id,
		"model":          "172",
		"common_name":    "Skyhawk SP", // reclassified after the flight below was logged
		"category_class": "airplane_single_engine_land",
		"engine_type":    "piston",
	})
	driftedAircraft := mustSave(t, app, "aircraft", map[string]any{
		"tail_number":   "N12345",
		"model":         driftedModel.Id,
		"instance_type": "real",
	})
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": pilot.Id, "aircraft": driftedAircraft.Id})
	mustSave(t, app, "flights", map[string]any{
		"pilot":                 pilot.Id,
		"aircraft":              driftedAircraft.Id,
		"date":                  "2026-09-09 00:00:00.000Z",
		"logged_aircraft_type":  "Skyhawk",
		"logged_category_class": "airplane_single_engine_land",
		"logged_engine_type":    "piston",
	})

	stableModel := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   manufacturer.Id,
		"model":          "182",
		"common_name":    "Skylane",
		"category_class": "airplane_single_engine_land",
		"engine_type":    "piston",
	})
	stableAircraft := mustSave(t, app, "aircraft", map[string]any{
		"tail_number":   "N67890",
		"model":         stableModel.Id,
		"instance_type": "real",
	})
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": pilot.Id, "aircraft": stableAircraft.Id})
	mustSave(t, app, "flights", map[string]any{
		"pilot":                 pilot.Id,
		"aircraft":              stableAircraft.Id,
		"date":                  "2026-09-09 00:00:00.000Z",
		"logged_aircraft_type":  "Skylane",
		"logged_category_class": "airplane_single_engine_land",
		"logged_engine_type":    "piston",
	})

	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	return &aircraftDriftFixture{app: app, token: token, driftedAircraft: driftedAircraft, stableAircraft: stableAircraft}
}

func TestAircraftDriftEndpoint_Unauthenticated(t *testing.T) {
	scenario := tests.ApiScenario{
		Name:           "no Authorization header",
		Method:         http.MethodGet,
		URL:            "/api/aircraft/drift",
		ExpectedStatus: 401,
		ExpectedContent: []string{
			`"status":401`,
		},
		TestAppFactory: func(t testing.TB) *tests.TestApp { return newTestApp(t) },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
	}
	scenario.Test(t)
}

func TestAircraftDriftEndpoint_NoPilotProfile(t *testing.T) {
	app := newTestApp(t)
	user := mustCreateUser(t, app, "no-pilot@example.com")
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	scenario := tests.ApiScenario{
		Name:           "authenticated user with no pilot profile",
		Method:         http.MethodGet,
		URL:            "/api/aircraft/drift",
		Headers:        map[string]string{"Authorization": token},
		ExpectedStatus: 404,
		ExpectedContent: []string{
			`"status":404`,
		},
		TestAppFactory: func(t testing.TB) *tests.TestApp { return app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
	}
	scenario.Test(t)
}

func TestAircraftDriftEndpoint_FlagsOnlyTheReclassifiedAircraft(t *testing.T) {
	f := newAircraftDriftFixture(t)

	scenario := tests.ApiScenario{
		Name:           "one drifted aircraft, one stable aircraft",
		Method:         http.MethodGet,
		URL:            "/api/aircraft/drift",
		Headers:        map[string]string{"Authorization": f.token},
		ExpectedStatus: 200,
		ExpectedContent: []string{
			`"` + f.driftedAircraft.Id + `":{`,
			`"flightCount":1`,
			`"description":"Skyhawk"`,
			`"description":"Skyhawk SP"`,
			`"flightIds":[`,
		},
		NotExpectedContent: []string{
			`"` + f.stableAircraft.Id + `":{`,
		},
		TestAppFactory: func(t testing.TB) *tests.TestApp { return f.app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
	}
	scenario.Test(t)
}
