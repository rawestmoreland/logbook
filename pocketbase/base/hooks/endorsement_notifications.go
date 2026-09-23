package hooks

import (
	"fmt"
	"html"
	"net/mail"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

// endorsementTypeLabels mirrors ENDORSEMENT_TYPE_LABELS in
// packages/core/src/endorsements.ts. Kept in lockstep by hand, the same as
// aircraftModelTypeFields/describeModel in aircraft_notifications.go mirror
// their TS counterparts.
var endorsementTypeLabels = map[string]string{
	"flight_review":    "Flight Review",
	"ipc":              "Instrument Proficiency Check",
	"checkride":        "Checkride",
	"complex":          "Complex Aircraft",
	"high_performance": "High-Performance Aircraft",
	"tailwheel":        "Tailwheel Aircraft",
}

func endorsementTypeLabel(t string) string {
	if label, ok := endorsementTypeLabels[t]; ok {
		return label
	}
	return t
}

// instructorAssignedFieldsChanged reports whether an endorsements update
// assigned a new `instructor` — a transition from unset or from a
// *different* CFI to a non-empty value. Re-saving with the same instructor
// id (e.g. the certification-text backfill in assignEndorsementInstructor
// touching other fields) is not a new transition and must not re-send.
// Mirrors modelTypeFieldsChanged's Original()-comparison shape in
// aircraft_notifications.go.
func instructorAssignedFieldsChanged(record *core.Record) bool {
	instructor := record.GetString("instructor")
	if instructor == "" {
		return false
	}
	return instructor != record.Original().GetString("instructor")
}

// endorsementAssignedEmailBody renders the "you were assigned as the CFI on
// an endorsement" notification: who assigned them, what kind of endorsement
// and when, and a link to sign it at /instruct.
func endorsementAssignedEmailBody(pilotName, endorsementType, date, instructURL string) (subject, htmlBody string) {
	label := endorsementTypeLabel(endorsementType)

	subject = fmt.Sprintf("%s assigned you to sign a %s endorsement", pilotName, label)
	htmlBody = fmt.Sprintf(
		`<p>Hello,</p>`+
			`<p><strong>%s</strong> has assigned you as the certifying instructor on a <strong>%s</strong> endorsement dated <strong>%s</strong>.</p>`+
			`<p>You can review and sign it at:</p>`+
			`<p><a href="%s">%s</a></p>`,
		html.EscapeString(pilotName),
		html.EscapeString(label),
		html.EscapeString(date),
		instructURL,
		html.EscapeString(instructURL),
	)
	return subject, htmlBody
}

// sendEndorsementAssignedEmail sends the newly-assigned CFI their
// notification, via the same SMTP settings/mail client as
// sendAircraftChangeDigestEmail.
func sendEndorsementAssignedEmail(app core.App, to mail.Address, pilotName, endorsementType, date string) error {
	instructURL := strings.TrimRight(app.Settings().Meta.AppURL, "/") + "/instruct"
	subject, htmlBody := endorsementAssignedEmailBody(pilotName, endorsementType, date, instructURL)

	message := &mailer.Message{
		From: mail.Address{
			Name:    app.Settings().Meta.SenderName,
			Address: app.Settings().Meta.SenderAddress,
		},
		To:      []mail.Address{to},
		Subject: subject,
		HTML:    htmlBody,
	}

	return app.NewMailClient().Send(message)
}

// resolveInstructorEmail walks instructor pilotId -> pilots.user -> users.email
// — the same pilot -> user relation resolvePilotEmail walks in
// aircraft_notifications.go, minus that function's opt-in gate: unlike the
// aircraft-reclassification digest (a passive notice gated by
// notify_aircraft_changes), being assigned as an endorsement's instructor is
// a direct, single, wanted action the CFI needs to know about to go sign
// anything, so this sends unconditionally rather than adding a new pilots
// opt-out field.
func resolveInstructorEmail(app core.App, pilotId string) (mail.Address, bool) {
	pilot, err := app.FindRecordById("pilots", pilotId)
	if err != nil {
		app.Logger().Error("endorsement assignment email: instructor pilot not found", "error", err, "pilot", pilotId)
		return mail.Address{}, false
	}

	userId := pilot.GetString("user")
	if userId == "" {
		return mail.Address{}, false
	}
	user, err := app.FindRecordById("users", userId)
	if err != nil {
		app.Logger().Error("endorsement assignment email: user not found", "error", err, "user", userId)
		return mail.Address{}, false
	}
	email := user.Email()
	if email == "" {
		return mail.Address{}, false
	}
	return mail.Address{Address: email}, true
}

// notifyEndorsementInstructorAssigned emails the newly-assigned CFI on an
// endorsement, resolving the assigning pilot's name and the endorsement's
// type/date via manual joins (endorsement -> flight -> pilot), the same
// style as notifyAircraftsReclassified's joins — no expand needed since Go
// hooks bypass API rules entirely. Called after the triggering
// assignEndorsementInstructor update has already committed; every error
// here is logged and swallowed rather than returned, since a failed
// notification must never fail or roll back that update.
func notifyEndorsementInstructorAssigned(app core.App, endorsement *core.Record) {
	instructorId := endorsement.GetString("instructor")
	if instructorId == "" {
		return
	}

	to, ok := resolveInstructorEmail(app, instructorId)
	if !ok {
		return
	}

	assigningPilotName := ""
	if flightId := endorsement.GetString("flight"); flightId != "" {
		flight, err := app.FindRecordById("flights", flightId)
		if err != nil {
			app.Logger().Error("endorsement assignment email: flight not found", "error", err, "flight", flightId)
		} else if pilotId := flight.GetString("pilot"); pilotId != "" {
			pilot, err := app.FindRecordById("pilots", pilotId)
			if err != nil {
				app.Logger().Error("endorsement assignment email: assigning pilot not found", "error", err, "pilot", pilotId)
			} else {
				assigningPilotName = pilot.GetString("name")
			}
		}
	}
	if assigningPilotName == "" {
		assigningPilotName = "A pilot"
	}

	date := endorsement.GetString("date")
	if date != "" {
		date = date[:10]
	}

	if err := sendEndorsementAssignedEmail(app, to, assigningPilotName, endorsement.GetString("type"), date); err != nil {
		app.Logger().Error("endorsement assignment email: send failed", "error", err, "endorsement", endorsement.Id, "instructor", instructorId)
	}
}

// RegisterEndorsementNotificationHooks emails a CFI when a pilot links them
// as the `instructor` on one of their endorsements via
// assignEndorsementInstructor (apps/web/src/lib/server/endorsements.ts) —
// the fast-follow PR #80 deferred. Unlike RegisterAircraftNotificationHooks,
// no dedupe guard is needed: instructorAssignedFieldsChanged's Original()
// comparison already distinguishes a no-op re-save of the same instructor
// from a genuine (re)assignment, and there's no multi-record fan-out here to
// collapse — each endorsement has exactly one instructor at a time, and
// PR #80 only allows reassigning before signed_at is set.
func RegisterEndorsementNotificationHooks(app core.App) {
	app.OnRecordAfterUpdateSuccess("endorsements").BindFunc(func(e *core.RecordEvent) error {
		if instructorAssignedFieldsChanged(e.Record) {
			notifyEndorsementInstructorAssigned(e.App, e.Record)
		}
		return e.Next()
	})
}
