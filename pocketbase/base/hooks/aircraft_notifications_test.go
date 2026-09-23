package hooks

import (
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "logbook/migrations"
)

func TestResolveAircraftType(t *testing.T) {
	live := &aircraftTypeInfo{description: "Cessna 172", categoryClass: "airplane_single_engine_land", engineType: "piston"}

	t.Run("falls back to live when the flight predates the snapshot", func(t *testing.T) {
		got := resolveAircraftType(flightAircraftSnapshot{}, live)
		if got != live {
			t.Fatalf("expected live, got %+v", got)
		}
	})

	t.Run("prefers the frozen snapshot over live", func(t *testing.T) {
		snapshot := flightAircraftSnapshot{
			aircraftType:  "Cessna 172 (old)",
			categoryClass: "airplane_multi_engine_land",
		}
		got := resolveAircraftType(snapshot, live)
		if got == live || got.categoryClass != "airplane_multi_engine_land" {
			t.Fatalf("expected the snapshot's own type, got %+v", got)
		}
	})
}

func TestHasAircraftTypeDrift(t *testing.T) {
	live := &aircraftTypeInfo{description: "Cessna 172", categoryClass: "airplane_single_engine_land", engineType: "piston"}

	t.Run("no drift when unset (no snapshot yet)", func(t *testing.T) {
		if hasAircraftTypeDrift(flightAircraftSnapshot{}, live) {
			t.Fatal("expected no drift")
		}
	})

	t.Run("no drift when the snapshot matches live", func(t *testing.T) {
		snapshot := flightAircraftSnapshot{
			aircraftType:  "Cessna 172",
			categoryClass: "airplane_single_engine_land",
			engineType:    "piston",
		}
		if hasAircraftTypeDrift(snapshot, live) {
			t.Fatal("expected no drift")
		}
	})

	t.Run("drift when a relevant field differs", func(t *testing.T) {
		snapshot := flightAircraftSnapshot{
			aircraftType:  "Cessna 172",
			categoryClass: "airplane_multi_engine_land",
			engineType:    "piston",
		}
		if !hasAircraftTypeDrift(snapshot, live) {
			t.Fatal("expected drift")
		}
	})

	t.Run("no drift when live is nil (no current classification to sync to)", func(t *testing.T) {
		snapshot := flightAircraftSnapshot{categoryClass: "airplane_multi_engine_land"}
		if hasAircraftTypeDrift(snapshot, nil) {
			t.Fatal("expected no drift")
		}
	})
}

// newFlight builds an in-memory flights record (no collection required, since
// computePilotDrift only reads a handful of raw fields off it) for
// computePilotDrift's unit tests.
func newFlight(pilotId string, snapshot flightAircraftSnapshot) *core.Record {
	collection := core.NewBaseCollection("flights")
	collection.Fields.Add(
		&core.TextField{Name: "pilot"},
		&core.TextField{Name: "logged_aircraft_type"},
		&core.TextField{Name: "logged_category_class"},
		&core.BoolField{Name: "logged_complex"},
		&core.BoolField{Name: "logged_high_performance"},
		&core.BoolField{Name: "logged_tailwheel"},
		&core.TextField{Name: "logged_engine_type"},
	)
	record := core.NewRecord(collection)
	record.Set("pilot", pilotId)
	record.Set("logged_aircraft_type", snapshot.aircraftType)
	record.Set("logged_category_class", snapshot.categoryClass)
	record.Set("logged_complex", snapshot.complex)
	record.Set("logged_high_performance", snapshot.highPerformance)
	record.Set("logged_tailwheel", snapshot.tailwheel)
	record.Set("logged_engine_type", snapshot.engineType)
	return record
}

func TestComputePilotDrift(t *testing.T) {
	live := &aircraftTypeInfo{description: "Cessna 172S", categoryClass: "airplane_single_engine_land", engineType: "piston"}
	oldType := flightAircraftSnapshot{aircraftType: "Cessna 172", categoryClass: "airplane_single_engine_land", complex: true, engineType: "piston"}
	currentType := flightAircraftSnapshot{aircraftType: "Cessna 172S", categoryClass: "airplane_single_engine_land", engineType: "piston"}

	flights := []*core.Record{
		newFlight("pilot-a", oldType),
		newFlight("pilot-a", oldType),
		newFlight("pilot-a", currentType), // not drifted, shouldn't count
		newFlight("pilot-b", oldType),
		newFlight("pilot-c", flightAircraftSnapshot{}), // no snapshot yet, shouldn't count
	}

	drifts := computePilotDrift(flights, live)

	if len(drifts) != 2 {
		t.Fatalf("expected 2 pilots with drift, got %d: %+v", len(drifts), drifts)
	}
	if drifts["pilot-a"].flightCount != 2 {
		t.Fatalf("expected pilot-a to have 2 drifted flights, got %d", drifts["pilot-a"].flightCount)
	}
	if len(drifts["pilot-a"].from) != 1 || drifts["pilot-a"].from[0].description != "Cessna 172" {
		t.Fatalf("expected pilot-a's from-type to be the old snapshot, got %+v", drifts["pilot-a"].from)
	}
	if drifts["pilot-b"].flightCount != 1 {
		t.Fatalf("expected pilot-b to have 1 drifted flight, got %d", drifts["pilot-b"].flightCount)
	}
	if _, ok := drifts["pilot-c"]; ok {
		t.Fatal("expected pilot-c (no snapshot yet) to have no drift")
	}

	t.Run("empty when live is nil", func(t *testing.T) {
		if drifts := computePilotDrift(flights, nil); len(drifts) != 0 {
			t.Fatalf("expected no drift, got %+v", drifts)
		}
	})
}

// newModel builds an in-memory aircraft_models-shaped record whose
// Original() reflects `before`, simulating a record freshly loaded from the
// database — mirroring how modelTypeFieldsChanged sees it inside
// OnRecordAfterUpdateSuccess.
func newModel(t *testing.T, before map[string]any) *core.Record {
	t.Helper()
	collection := core.NewBaseCollection("aircraft_models")
	collection.Fields.Add(
		&core.TextField{Name: "model"},
		&core.TextField{Name: "common_name"},
		&core.TextField{Name: "category_class"},
		&core.BoolField{Name: "complex"},
		&core.BoolField{Name: "high_performance"},
		&core.BoolField{Name: "tailwheel"},
		&core.TextField{Name: "engine_type"},
		&core.TextField{Name: "icao"},
	)
	record := core.NewRecord(collection)
	record.Id = "test-model-id"
	record.Load(before)
	if err := record.PostScan(); err != nil {
		t.Fatalf("PostScan: %v", err)
	}
	return record
}

func TestModelTypeFieldsChanged(t *testing.T) {
	base := map[string]any{
		"model":            "172",
		"common_name":      "Skyhawk",
		"category_class":   "airplane_single_engine_land",
		"complex":          false,
		"high_performance": false,
		"tailwheel":        false,
		"engine_type":      "piston",
	}

	t.Run("false when nothing relevant changed", func(t *testing.T) {
		record := newModel(t, base)
		record.Set("icao", "C172") // irrelevant field
		if modelTypeFieldsChanged(record) {
			t.Fatal("expected no change")
		}
	})

	t.Run("true when category_class changes", func(t *testing.T) {
		record := newModel(t, base)
		record.Set("category_class", "airplane_multi_engine_land")
		if !modelTypeFieldsChanged(record) {
			t.Fatal("expected a change")
		}
	})

	t.Run("true when complex changes", func(t *testing.T) {
		record := newModel(t, base)
		record.Set("complex", true)
		if !modelTypeFieldsChanged(record) {
			t.Fatal("expected a change")
		}
	})
}

func TestAircraftChangeEmailBody(t *testing.T) {
	live := aircraftTypeInfo{description: "Cessna 172S"}
	drift := &pilotAircraftDrift{
		flightCount: 3,
		from:        []aircraftTypeInfo{{description: "Cessna 172"}},
	}

	subject, body := aircraftChangeEmailBody("N12345", drift, live, "https://example.com/aircraft")

	if !strings.Contains(subject, "N12345") {
		t.Errorf("expected subject to mention the tail number, got %q", subject)
	}
	for _, want := range []string{"N12345", "Cessna 172", "Cessna 172S", "3", "https://example.com/aircraft", "sync"} {
		if !strings.Contains(body, want) {
			t.Errorf("expected body to contain %q, got:\n%s", want, body)
		}
	}
}

func TestPluralVerb(t *testing.T) {
	if pluralVerb(1) != "is" {
		t.Errorf("expected singular")
	}
	if pluralVerb(0) != "are" || pluralVerb(2) != "are" {
		t.Errorf("expected plural")
	}
}

// --- integration: the actual hook wiring, against a real (freshly
// migrated) PocketBase test app ---

func newTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestAppWithConfig(core.BaseAppConfig{
		DataDir:       t.TempDir(),
		EncryptionEnv: "pb_test_env",
	})
	if err != nil {
		t.Fatalf("failed to create test app: %v", err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

func mustSave(t *testing.T, app core.App, collectionName string, data map[string]any) *core.Record {
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

func mustCreateUser(t *testing.T, app core.App, email string) *core.Record {
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

// aircraftNotificationFixture wires up one aircraft with one model and two
// pilots (one opted in, one opted out) who've each logged a flight on it —
// the minimal setup notifyAircraftReclassified's triggers need.
type aircraftNotificationFixture struct {
	app          *tests.TestApp
	model        *core.Record
	aircraft     *core.Record
	optedInEmail string
	optedOutFlt  *core.Record
}

func newAircraftNotificationFixture(t *testing.T) *aircraftNotificationFixture {
	t.Helper()
	app := newTestApp(t)
	RegisterAircraftNotificationHooks(app)

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

	optedInUser := mustCreateUser(t, app, "opted-in@example.com")
	optedInPilot := mustSave(t, app, "pilots", map[string]any{
		"user":                    optedInUser.Id,
		"name":                    "Opted In",
		"notify_aircraft_changes": true,
	})
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": optedInPilot.Id, "aircraft": aircraft.Id})
	mustSave(t, app, "flights", map[string]any{
		"pilot":                 optedInPilot.Id,
		"aircraft":              aircraft.Id,
		"logged_aircraft_type":  "Skyhawk",
		"logged_category_class": "airplane_single_engine_land",
		"logged_engine_type":    "piston",
	})

	optedOutUser := mustCreateUser(t, app, "opted-out@example.com")
	optedOutPilot := mustSave(t, app, "pilots", map[string]any{
		"user":                    optedOutUser.Id,
		"name":                    "Opted Out",
		"notify_aircraft_changes": false,
	})
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": optedOutPilot.Id, "aircraft": aircraft.Id})
	optedOutFlt := mustSave(t, app, "flights", map[string]any{
		"pilot":                 optedOutPilot.Id,
		"aircraft":              aircraft.Id,
		"logged_aircraft_type":  "Skyhawk",
		"logged_category_class": "airplane_single_engine_land",
		"logged_engine_type":    "piston",
	})

	return &aircraftNotificationFixture{
		app:          app,
		model:        model,
		aircraft:     aircraft,
		optedInEmail: "opted-in@example.com",
		optedOutFlt:  optedOutFlt,
	}
}

func TestRegisterAircraftNotificationHooks_ModelReclassified(t *testing.T) {
	f := newAircraftNotificationFixture(t)

	f.model.Set("category_class", "airplane_multi_engine_land")
	if err := f.app.SaveNoValidate(f.model); err != nil {
		t.Fatalf("save model: %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 1 {
		t.Fatalf("expected exactly 1 email (opted-out pilot skipped), got %d", got)
	}
	msg := f.app.TestMailer.LastMessage()
	if len(msg.To) != 1 || msg.To[0].Address != f.optedInEmail {
		t.Fatalf("expected the email to go to the opted-in pilot, got %+v", msg.To)
	}
	if !strings.Contains(msg.Subject, "N12345") {
		t.Errorf("expected subject to mention the tail number, got %q", msg.Subject)
	}
}

func TestRegisterAircraftNotificationHooks_IrrelevantFieldChange(t *testing.T) {
	f := newAircraftNotificationFixture(t)

	f.model.Set("icao", "C172")
	if err := f.app.SaveNoValidate(f.model); err != nil {
		t.Fatalf("save model: %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 0 {
		t.Fatalf("expected no email for an irrelevant field change, got %d", got)
	}
}

func TestRegisterAircraftNotificationHooks_TailReassignedToDifferentModel(t *testing.T) {
	f := newAircraftNotificationFixture(t)

	otherModel := mustSave(t, f.app, "aircraft_models", map[string]any{
		"manufacturer":   f.model.GetString("manufacturer"),
		"model":          "182",
		"common_name":    "Skylane",
		"category_class": "airplane_single_engine_land",
		"engine_type":    "piston",
	})

	f.aircraft.Set("model", otherModel.Id)
	if err := f.app.SaveNoValidate(f.aircraft); err != nil {
		t.Fatalf("save aircraft: %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 1 {
		t.Fatalf("expected exactly 1 email, got %d", got)
	}
	msg := f.app.TestMailer.LastMessage()
	if !strings.Contains(msg.HTML, "Skylane") {
		t.Errorf("expected the email body to mention the new type, got:\n%s", msg.HTML)
	}
}

// --- issue #78: dedupe/batch ---

func TestNotificationGuard(t *testing.T) {
	now := time.Now()
	guard := newNotificationGuard(15 * time.Minute)
	guard.now = func() time.Time { return now }

	if !guard.shouldNotify("pilot-a|aircraft-1") {
		t.Fatal("expected the first notification for a key to go through")
	}
	if guard.shouldNotify("pilot-a|aircraft-1") {
		t.Fatal("expected a repeat within the window to be suppressed")
	}
	if !guard.shouldNotify("pilot-a|aircraft-2") {
		t.Fatal("expected a different key to be unaffected by the first key's guard")
	}

	now = now.Add(15 * time.Minute)
	if !guard.shouldNotify("pilot-a|aircraft-1") {
		t.Fatal("expected the guard to allow a repeat once the window has elapsed")
	}
}

func TestRegisterAircraftNotificationHooks_RepeatedSavesSendOneEmail(t *testing.T) {
	f := newAircraftNotificationFixture(t)

	// An admin fixing typos across a couple of saves in a row — each is a
	// genuine modelTypeFieldsChanged trigger, but both concern the same
	// pilot+aircraft pair within the guard's window.
	f.model.Set("category_class", "airplane_multi_engine_land")
	if err := f.app.SaveNoValidate(f.model); err != nil {
		t.Fatalf("save model (1st): %v", err)
	}
	f.model.Set("complex", true)
	if err := f.app.SaveNoValidate(f.model); err != nil {
		t.Fatalf("save model (2nd): %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 1 {
		t.Fatalf("expected repeated saves to collapse into 1 email, got %d", got)
	}
}

func TestRegisterAircraftNotificationHooks_FanOutSendsOneEmailPerPilot(t *testing.T) {
	app := newTestApp(t)
	RegisterAircraftNotificationHooks(app)

	manufacturer := mustSave(t, app, "manufacturers", map[string]any{"name": "Cessna"})
	model := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   manufacturer.Id,
		"model":          "172",
		"common_name":    "Skyhawk",
		"category_class": "airplane_single_engine_land",
		"engine_type":    "piston",
	})

	// Two tails of the same model.
	aircraft1 := mustSave(t, app, "aircraft", map[string]any{
		"tail_number":   "N11111",
		"model":         model.Id,
		"instance_type": "real",
	})
	aircraft2 := mustSave(t, app, "aircraft", map[string]any{
		"tail_number":   "N22222",
		"model":         model.Id,
		"instance_type": "real",
	})

	user := mustCreateUser(t, app, "multi-tail@example.com")
	pilot := mustSave(t, app, "pilots", map[string]any{
		"user":                    user.Id,
		"name":                    "Multi Tail",
		"notify_aircraft_changes": true,
	})

	// The same pilot has flown, and still flies, both tails.
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": pilot.Id, "aircraft": aircraft1.Id})
	mustSave(t, app, "pilot_aircraft", map[string]any{"pilot": pilot.Id, "aircraft": aircraft2.Id})
	mustSave(t, app, "flights", map[string]any{
		"pilot":                 pilot.Id,
		"aircraft":              aircraft1.Id,
		"logged_aircraft_type":  "Skyhawk",
		"logged_category_class": "airplane_single_engine_land",
		"logged_engine_type":    "piston",
	})
	mustSave(t, app, "flights", map[string]any{
		"pilot":                 pilot.Id,
		"aircraft":              aircraft2.Id,
		"logged_aircraft_type":  "Skyhawk",
		"logged_category_class": "airplane_single_engine_land",
		"logged_engine_type":    "piston",
	})

	// One edit to the shared model fans out to both tails.
	model.Set("category_class", "airplane_multi_engine_land")
	if err := app.SaveNoValidate(model); err != nil {
		t.Fatalf("save model: %v", err)
	}

	if got := app.TestMailer.TotalSend(); got != 1 {
		t.Fatalf("expected exactly 1 email for the pilot despite 2 affected tails, got %d", got)
	}
	msg := app.TestMailer.LastMessage()
	if len(msg.To) != 1 || msg.To[0].Address != "multi-tail@example.com" {
		t.Fatalf("expected the email to go to the multi-tail pilot, got %+v", msg.To)
	}
	for _, want := range []string{"N11111", "N22222"} {
		if !strings.Contains(msg.HTML, want) {
			t.Errorf("expected the digest body to mention tail %q, got:\n%s", want, msg.HTML)
		}
	}
}
