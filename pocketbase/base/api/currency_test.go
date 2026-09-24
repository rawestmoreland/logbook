package api

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "logbook/migrations"
)

func newTestApp(t testing.TB) *tests.TestApp {
	app, err := tests.NewTestAppWithConfig(core.BaseAppConfig{
		DataDir:       t.TempDir(),
		EncryptionEnv: "pb_test_env",
	})
	if err != nil {
		t.Fatalf("failed to create test app: %v", err)
	}
	return app
}

func mustSave(t testing.TB, app core.App, collectionName string, data map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("find collection %q: %v", collectionName, err)
	}
	record := core.NewRecord(collection)
	record.Load(data)
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatalf("save %q: %v", collectionName, err)
	}
	return record
}

func mustCreateUser(t testing.TB, app core.App, email string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("find users collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.SetEmail(email)
	record.SetPassword("test-password-1234")
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatalf("save user: %v", err)
	}
	return record
}

// currencyFixture wires up one pilot who has flown a single-engine-land
// aircraft three times in the last week (comfortably inside every 90-day
// passenger-currency window) — the minimal setup to exercise the endpoint's
// full data-loading + rule-evaluation path.
type currencyFixture struct {
	app   *tests.TestApp
	token string
}

func newCurrencyFixture(t testing.TB) *currencyFixture {
	t.Helper()
	app := newTestApp(t)

	user := mustCreateUser(t, app, "pilot@example.com")
	pilot := mustSave(t, app, "pilots", map[string]any{
		"user": user.Id,
		"name": "Test Pilot",
	})

	manufacturer := mustSave(t, app, "manufacturers", map[string]any{"name": "Cessna"})
	model := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   manufacturer.Id,
		"model":          "172",
		"common_name":    "Skyhawk",
		"category_class": "airplane_single_engine_land",
		"engine_type":    "piston",
	})
	aircraft := mustSave(t, app, "aircraft", map[string]any{
		"tail_number":   "N12345",
		"model":         model.Id,
		"instance_type": "real",
	})
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": pilot.Id, "aircraft": aircraft.Id})

	for i := 0; i < 3; i++ {
		mustSave(t, app, "flights", map[string]any{
			"pilot":                  pilot.Id,
			"aircraft":               aircraft.Id,
			"date":                   "2026-09-09 00:00:00.000Z",
			"route_from":             "KPAO",
			"route_to":               "KPAO",
			"logged_aircraft_type":   "Skyhawk",
			"logged_category_class":  "airplane_single_engine_land",
			"logged_engine_type":     "piston",
			"total_landings":         1,
			"day_landings_full_stop": 1,
		})
	}

	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	return &currencyFixture{app: app, token: token}
}

func TestCurrencyEndpoint_Unauthenticated(t *testing.T) {
	scenario := tests.ApiScenario{
		Name:           "no Authorization header",
		Method:         http.MethodGet,
		URL:            "/api/currency",
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

func TestCurrencyEndpoint_NoPilotProfile(t *testing.T) {
	app := newTestApp(t)
	user := mustCreateUser(t, app, "no-pilot@example.com")
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	scenario := tests.ApiScenario{
		Name:           "authenticated user with no pilot profile",
		Method:         http.MethodGet,
		URL:            "/api/currency",
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

func TestCurrencyEndpoint_ComputesDayPassengerCurrency(t *testing.T) {
	f := newCurrencyFixture(t)

	scenario := tests.ApiScenario{
		Name:           "pilot current on day passenger currency",
		Method:         http.MethodGet,
		URL:            "/api/currency",
		Headers:        map[string]string{"Authorization": f.token},
		ExpectedStatus: 200,
		ExpectedContent: []string{
			`"categoryClass":"airplane_single_engine_land"`,
			`"rule":"61.57(a)(1)"`,
			`"state":"current"`,
			`"have":3`,
			`"tailNumber":"N12345"`,
			`"isEasa":false`,
		},
		TestAppFactory: func(t testing.TB) *tests.TestApp { return f.app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
	}
	scenario.Test(t)
}
