package api

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// adminMergeFixture wires up two manufacturers (Canadair/Bombardier) and, on
// each, a model — plus an aircraft and an open report on the losing model —
// the minimal setup to exercise both merge endpoints' full repoint path.
type adminMergeFixture struct {
	app             *tests.TestApp
	adminToken      string
	nonAdminToken   string
	loserMfr        *core.Record
	survivorMfr     *core.Record
	loserModel      *core.Record
	survivorModel   *core.Record
	loserModelOnMfr *core.Record
	aircraft        *core.Record
	report          *core.Record
}

func newAdminMergeFixture(t testing.TB) *adminMergeFixture {
	t.Helper()
	app := newTestApp(t)

	adminUser := mustCreateUser(t, app, "admin@example.com")
	mustSave(t, app, "pilots", map[string]any{
		"user":     adminUser.Id,
		"name":     "Admin Pilot",
		"is_admin": true,
	})
	adminToken, err := adminUser.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create admin auth token: %v", err)
	}

	nonAdminUser := mustCreateUser(t, app, "pilot@example.com")
	mustSave(t, app, "pilots", map[string]any{"user": nonAdminUser.Id, "name": "Regular Pilot"})
	nonAdminToken, err := nonAdminUser.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create non-admin auth token: %v", err)
	}

	loserMfr := mustSave(t, app, "manufacturers", map[string]any{"name": "Canadair"})
	survivorMfr := mustSave(t, app, "manufacturers", map[string]any{"name": "Bombardier"})

	loserModelOnMfr := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   loserMfr.Id,
		"model":          "Regional Jet (old)",
		"category_class": "airplane_multi_engine_land",
		"engine_type":    "jet",
	})

	loserModel := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   survivorMfr.Id,
		"model":          "CRJ200-dup",
		"category_class": "airplane_multi_engine_land",
		"engine_type":    "jet",
	})
	survivorModel := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   survivorMfr.Id,
		"model":          "CRJ200",
		"category_class": "airplane_multi_engine_land",
		"engine_type":    "jet",
	})

	aircraft := mustSave(t, app, "aircraft", map[string]any{
		"tail_number":   "N700CR",
		"model":         loserModel.Id,
		"instance_type": "real",
	})

	report := mustSave(t, app, "aircraft_model_reports", map[string]any{
		"model":       loserModel.Id,
		"reported_by": nonAdminUser.Id,
		"reason":      "duplicate_of_another_model",
		"status":      "open",
	})

	return &adminMergeFixture{
		app: app, adminToken: adminToken, nonAdminToken: nonAdminToken,
		loserMfr: loserMfr, survivorMfr: survivorMfr,
		loserModel: loserModel, survivorModel: survivorModel, loserModelOnMfr: loserModelOnMfr,
		aircraft: aircraft, report: report,
	}
}

func TestMergeManufacturers_RequiresAdmin(t *testing.T) {
	f := newAdminMergeFixture(t)

	scenario := tests.ApiScenario{
		Name:            "non-admin pilot forbidden",
		Method:          http.MethodPost,
		URL:             "/api/admin/merge-manufacturers",
		Headers:         map[string]string{"Authorization": f.nonAdminToken},
		Body:            strings.NewReader(`{"loserId":"` + f.loserMfr.Id + `","survivorId":"` + f.survivorMfr.Id + `"}`),
		ExpectedStatus:  403,
		ExpectedContent: []string{`"status":403`},
		TestAppFactory:  func(t testing.TB) *tests.TestApp { return f.app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
	}
	scenario.Test(t)
}

func TestMergeManufacturers_RepointsModelsAndDeletesLoser(t *testing.T) {
	f := newAdminMergeFixture(t)

	scenario := tests.ApiScenario{
		Name:            "admin merges manufacturers",
		Method:          http.MethodPost,
		URL:             "/api/admin/merge-manufacturers",
		Headers:         map[string]string{"Authorization": f.adminToken},
		Body:            strings.NewReader(`{"loserId":"` + f.loserMfr.Id + `","survivorId":"` + f.survivorMfr.Id + `"}`),
		ExpectedStatus:  200,
		ExpectedContent: []string{`"modelsRepointed":1`},
		TestAppFactory:  func(t testing.TB) *tests.TestApp { return f.app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
		AfterTestFunc: func(t testing.TB, app *tests.TestApp, res *http.Response) {
			model, err := app.FindRecordById("aircraft_models", f.loserModelOnMfr.Id)
			if err != nil {
				t.Fatalf("expected repointed model to still exist: %v", err)
			}
			if model.GetString("manufacturer") != f.survivorMfr.Id {
				t.Fatalf("expected model repointed to survivor, got %q", model.GetString("manufacturer"))
			}
			if _, err := app.FindRecordById("manufacturers", f.loserMfr.Id); err == nil {
				t.Fatalf("expected losing manufacturer to be deleted")
			}
		},
	}
	scenario.Test(t)
}

func TestMergeModels_RepointsAircraftAndReportsAndDeletesLoser(t *testing.T) {
	f := newAdminMergeFixture(t)

	scenario := tests.ApiScenario{
		Name:            "admin merges models",
		Method:          http.MethodPost,
		URL:             "/api/admin/merge-models",
		Headers:         map[string]string{"Authorization": f.adminToken},
		Body:            strings.NewReader(`{"loserId":"` + f.loserModel.Id + `","survivorId":"` + f.survivorModel.Id + `"}`),
		ExpectedStatus:  200,
		ExpectedContent: []string{`"aircraftRepointed":1`, `"reportsRepointed":1`},
		TestAppFactory:  func(t testing.TB) *tests.TestApp { return f.app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
		AfterTestFunc: func(t testing.TB, app *tests.TestApp, res *http.Response) {
			aircraft, err := app.FindRecordById("aircraft", f.aircraft.Id)
			if err != nil {
				t.Fatalf("expected aircraft to still exist: %v", err)
			}
			if aircraft.GetString("model") != f.survivorModel.Id {
				t.Fatalf("expected aircraft repointed to survivor model, got %q", aircraft.GetString("model"))
			}

			report, err := app.FindRecordById("aircraft_model_reports", f.report.Id)
			if err != nil {
				t.Fatalf("expected report to still exist: %v", err)
			}
			if report.GetString("model") != f.survivorModel.Id {
				t.Fatalf("expected report repointed to survivor model, got %q", report.GetString("model"))
			}
			if report.GetString("status") != "open" {
				t.Fatalf("expected report to remain open, got %q", report.GetString("status"))
			}

			if _, err := app.FindRecordById("aircraft_models", f.loserModel.Id); err == nil {
				t.Fatalf("expected losing model to be deleted")
			}
		},
	}
	scenario.Test(t)
}

func TestMergeModels_SameIdRejected(t *testing.T) {
	f := newAdminMergeFixture(t)

	scenario := tests.ApiScenario{
		Name:            "loserId == survivorId rejected",
		Method:          http.MethodPost,
		URL:             "/api/admin/merge-models",
		Headers:         map[string]string{"Authorization": f.adminToken},
		Body:            strings.NewReader(`{"loserId":"` + f.loserModel.Id + `","survivorId":"` + f.loserModel.Id + `"}`),
		ExpectedStatus:  400,
		ExpectedContent: []string{`"status":400`},
		TestAppFactory:  func(t testing.TB) *tests.TestApp { return f.app },
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			RegisterRoutes(app, e)
		},
	}
	scenario.Test(t)
}
