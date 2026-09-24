package hooks

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "logbook/migrations"
)

func TestEndorsementTypeLabel(t *testing.T) {
	if got := endorsementTypeLabel("flight_review"); got != "Flight Review" {
		t.Errorf("expected %q, got %q", "Flight Review", got)
	}
	if got := endorsementTypeLabel("ipc"); got != "Instrument Proficiency Check" {
		t.Errorf("expected %q, got %q", "Instrument Proficiency Check", got)
	}
	t.Run("falls back to the raw value for an unrecognized type", func(t *testing.T) {
		if got := endorsementTypeLabel("something_new"); got != "something_new" {
			t.Errorf("expected passthrough, got %q", got)
		}
	})
}

// newEndorsement builds an in-memory endorsements-shaped record whose
// Original() reflects `before`, simulating a record freshly loaded from the
// database — mirroring newModel's approach in aircraft_notifications_test.go
// for how instructorAssignedFieldsChanged sees it inside
// OnRecordAfterUpdateSuccess.
func newEndorsement(t *testing.T, before map[string]any) *core.Record {
	t.Helper()
	collection := core.NewBaseCollection("endorsements")
	collection.Fields.Add(
		&core.TextField{Name: "flight"},
		&core.TextField{Name: "instructor"},
		&core.TextField{Name: "type"},
		&core.TextField{Name: "text"},
		&core.DateField{Name: "date"},
		&core.DateField{Name: "signed_at"},
	)
	record := core.NewRecord(collection)
	record.Id = "test-endorsement-id"
	record.Load(before)
	if err := record.PostScan(); err != nil {
		t.Fatalf("PostScan: %v", err)
	}
	return record
}

func TestInstructorAssignedFieldsChanged(t *testing.T) {
	t.Run("false when instructor stays unset", func(t *testing.T) {
		record := newEndorsement(t, map[string]any{})
		if instructorAssignedFieldsChanged(record) {
			t.Fatal("expected no change")
		}
	})

	t.Run("true on a fresh assignment", func(t *testing.T) {
		record := newEndorsement(t, map[string]any{})
		record.Set("instructor", "cfi-a")
		if !instructorAssignedFieldsChanged(record) {
			t.Fatal("expected a change")
		}
	})

	t.Run("false re-saving the same instructor", func(t *testing.T) {
		record := newEndorsement(t, map[string]any{"instructor": "cfi-a"})
		record.Set("instructor", "cfi-a")
		record.Set("text", "unrelated edit")
		if instructorAssignedFieldsChanged(record) {
			t.Fatal("expected no change for a re-save of the same instructor")
		}
	})

	t.Run("true when reassigned to a different CFI", func(t *testing.T) {
		record := newEndorsement(t, map[string]any{"instructor": "cfi-a"})
		record.Set("instructor", "cfi-b")
		if !instructorAssignedFieldsChanged(record) {
			t.Fatal("expected a change")
		}
	})

	t.Run("false when instructor is cleared", func(t *testing.T) {
		record := newEndorsement(t, map[string]any{"instructor": "cfi-a"})
		record.Set("instructor", "")
		if instructorAssignedFieldsChanged(record) {
			t.Fatal("expected no change — this is a departure, not an assignment")
		}
	})
}

func TestEndorsementAssignedEmailBody(t *testing.T) {
	subject, body := endorsementAssignedEmailBody("Jane Pilot", "flight_review", "2026-01-15", "https://example.com/instruct")

	if !strings.Contains(subject, "Jane Pilot") || !strings.Contains(subject, "Flight Review") {
		t.Errorf("expected subject to mention the pilot and type, got %q", subject)
	}
	for _, want := range []string{"Jane Pilot", "Flight Review", "2026-01-15", "https://example.com/instruct"} {
		if !strings.Contains(body, want) {
			t.Errorf("expected body to contain %q, got:\n%s", want, body)
		}
	}
}

func TestEndorsementAssignedEmailBody_EscapesInput(t *testing.T) {
	_, body := endorsementAssignedEmailBody(`<script>alert(1)</script>`, "checkride", "2026-01-15", "https://example.com/instruct")

	if strings.Contains(body, "<script>") {
		t.Errorf("expected pilot name to be HTML-escaped, got:\n%s", body)
	}
}

// --- integration: the actual hook wiring, against a real (freshly
// migrated) PocketBase test app ---

// endorsementNotificationFixture wires up an assigning pilot with a logged
// flight and an unsigned endorsement on it, plus a separate CFI-flagged
// pilot who can be linked as its instructor — the minimal setup
// notifyEndorsementInstructorAssigned's trigger needs.
type endorsementNotificationFixture struct {
	app         *tests.TestApp
	endorsement *core.Record
	cfi         *core.Record
	cfiEmail    string
}

func newEndorsementNotificationFixture(t *testing.T) *endorsementNotificationFixture {
	t.Helper()
	app := newTestApp(t)
	RegisterEndorsementNotificationHooks(app)

	pilotUser := mustCreateUser(t, app, "assigning-pilot@example.com")
	pilot := mustSave(t, app, "pilots", map[string]any{
		"user": pilotUser.Id,
		"name": "Jane Pilot",
	})
	flight := mustSave(t, app, "flights", map[string]any{
		"pilot": pilot.Id,
	})
	endorsement := mustSave(t, app, "endorsements", map[string]any{
		"flight": flight.Id,
		"type":   "flight_review",
		"date":   "2026-01-15 00:00:00.000Z",
	})

	cfiUser := mustCreateUser(t, app, "cfi@example.com")
	cfi := mustSave(t, app, "pilots", map[string]any{
		"user":          cfiUser.Id,
		"name":          "Cy Instructor",
		"is_instructor": true,
	})

	return &endorsementNotificationFixture{
		app:         app,
		endorsement: endorsement,
		cfi:         cfi,
		cfiEmail:    "cfi@example.com",
	}
}

func TestRegisterEndorsementNotificationHooks_AssignmentSendsEmail(t *testing.T) {
	f := newEndorsementNotificationFixture(t)

	f.endorsement.Set("instructor", f.cfi.Id)
	if err := f.app.SaveNoValidate(f.endorsement); err != nil {
		t.Fatalf("save endorsement: %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 1 {
		t.Fatalf("expected exactly 1 email, got %d", got)
	}
	msg := f.app.TestMailer.LastMessage()
	if len(msg.To) != 1 || msg.To[0].Address != f.cfiEmail {
		t.Fatalf("expected the email to go to the assigned CFI, got %+v", msg.To)
	}
	if !strings.Contains(msg.Subject, "Jane Pilot") {
		t.Errorf("expected subject to mention the assigning pilot, got %q", msg.Subject)
	}
	if !strings.Contains(msg.HTML, "/instruct") {
		t.Errorf("expected body to link to /instruct, got:\n%s", msg.HTML)
	}
}

func TestRegisterEndorsementNotificationHooks_ResaveSameInstructorNoDuplicate(t *testing.T) {
	f := newEndorsementNotificationFixture(t)

	f.endorsement.Set("instructor", f.cfi.Id)
	if err := f.app.SaveNoValidate(f.endorsement); err != nil {
		t.Fatalf("save endorsement (assign): %v", err)
	}

	// Re-fetch so Original() reflects the just-persisted state, the same way
	// the real API layer loads a fresh record per request rather than
	// reusing one in-memory instance across saves (Record.Original() is only
	// refreshed on load/PostScan, not automatically after Save — see
	// PocketBase's Record.PostScan doc comment).
	reloaded, err := f.app.FindRecordById("endorsements", f.endorsement.Id)
	if err != nil {
		t.Fatalf("reload endorsement: %v", err)
	}
	reloaded.Set("instructor", f.cfi.Id)
	reloaded.Set("text", "an unrelated edit")
	if err := f.app.SaveNoValidate(reloaded); err != nil {
		t.Fatalf("save endorsement (unrelated edit): %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 1 {
		t.Fatalf("expected re-saving the same instructor to send no duplicate, got %d emails", got)
	}
}

func TestRegisterEndorsementNotificationHooks_ReassignedToDifferentCfiSendsFreshEmail(t *testing.T) {
	f := newEndorsementNotificationFixture(t)

	f.endorsement.Set("instructor", f.cfi.Id)
	if err := f.app.SaveNoValidate(f.endorsement); err != nil {
		t.Fatalf("save endorsement (assign): %v", err)
	}

	otherCfiUser := mustCreateUser(t, f.app, "other-cfi@example.com")
	otherCfi := mustSave(t, f.app, "pilots", map[string]any{
		"user":          otherCfiUser.Id,
		"name":          "Other Instructor",
		"is_instructor": true,
	})

	// Re-fetch so Original() reflects the first assignment — see the
	// no-duplicate test's comment on why a reused in-memory record wouldn't.
	reloaded, err := f.app.FindRecordById("endorsements", f.endorsement.Id)
	if err != nil {
		t.Fatalf("reload endorsement: %v", err)
	}
	reloaded.Set("instructor", otherCfi.Id)
	if err := f.app.SaveNoValidate(reloaded); err != nil {
		t.Fatalf("save endorsement (reassign): %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 2 {
		t.Fatalf("expected 2 emails (one per assigned CFI), got %d", got)
	}
	msg := f.app.TestMailer.LastMessage()
	if len(msg.To) != 1 || msg.To[0].Address != "other-cfi@example.com" {
		t.Fatalf("expected the second email to go to the newly-assigned CFI, got %+v", msg.To)
	}
}

func TestRegisterEndorsementNotificationHooks_NoInstructorFieldNoEmail(t *testing.T) {
	f := newEndorsementNotificationFixture(t)

	f.endorsement.Set("text", "just an edit, no instructor assigned")
	if err := f.app.SaveNoValidate(f.endorsement); err != nil {
		t.Fatalf("save endorsement: %v", err)
	}

	if got := f.app.TestMailer.TotalSend(); got != 0 {
		t.Fatalf("expected no email when instructor was never assigned, got %d", got)
	}
}
