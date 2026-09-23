// Package hooks holds custom PocketBase record hooks for this backend.
package hooks

import (
	"fmt"
	"html"
	"net/mail"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

// aircraftTypeInfo mirrors AircraftTypeInfo in packages/core/src/aircraft.ts
// — the currency/analysis/display-relevant slice of an aircraft_models row,
// resolved either from a flight's frozen logged_* snapshot or from the live
// catalog. Kept in lockstep by hand, the same as seaplaneCategoryClasses in
// aircraft_models.go.
type aircraftTypeInfo struct {
	description     string
	categoryClass   string
	complex         bool
	highPerformance bool
	tailwheel       bool
	engineType      string
}

// flightAircraftSnapshot mirrors FlightAircraftSnapshot in
// packages/core/src/aircraft.ts — the subset of a flights row's logged_*
// fields resolveAircraftType needs.
type flightAircraftSnapshot struct {
	aircraftType    string
	categoryClass   string
	complex         bool
	highPerformance bool
	tailwheel       bool
	engineType      string
}

func snapshotFromFlight(f *core.Record) flightAircraftSnapshot {
	return flightAircraftSnapshot{
		aircraftType:    f.GetString("logged_aircraft_type"),
		categoryClass:   f.GetString("logged_category_class"),
		complex:         f.GetBool("logged_complex"),
		highPerformance: f.GetBool("logged_high_performance"),
		tailwheel:       f.GetBool("logged_tailwheel"),
		engineType:      f.GetString("logged_engine_type"),
	}
}

// resolveAircraftType mirrors resolveAircraftType in
// packages/core/src/aircraft.ts: a flight's frozen snapshot wins over the
// aircraft's current live model data, falling back to live only when the
// flight predates the snapshot (an empty logged_category_class). Unlike the
// TS version, this never validates categoryClass against the closed
// CATEGORY_CLASSES set — every value read here came from a PocketBase select
// field already constrained to it, so "non-empty" and "recognized" coincide.
func resolveAircraftType(snapshot flightAircraftSnapshot, live *aircraftTypeInfo) *aircraftTypeInfo {
	if snapshot.categoryClass == "" {
		return live
	}
	return &aircraftTypeInfo{
		description:     snapshot.aircraftType,
		categoryClass:   snapshot.categoryClass,
		complex:         snapshot.complex,
		highPerformance: snapshot.highPerformance,
		tailwheel:       snapshot.tailwheel,
		engineType:      snapshot.engineType,
	}
}

// hasAircraftTypeDrift mirrors hasAircraftTypeDrift in
// packages/core/src/aircraft.ts.
func hasAircraftTypeDrift(snapshot flightAircraftSnapshot, live *aircraftTypeInfo) bool {
	if live == nil {
		return false
	}
	logged := resolveAircraftType(snapshot, live)
	return logged != nil && *logged != *live
}

// describeModel mirrors describeModel in apps/web/src/lib/server/models.ts.
func describeModel(manufacturerName, model, commonName string) string {
	if commonName != "" {
		return commonName
	}
	return manufacturerName + " " + model
}

// aircraftTypeInfoFromModel mirrors the "live" half of toAircraftTypeInfo in
// apps/web/src/lib/server/models.ts, reading straight off an aircraft_models
// row's current catalog data. Returns nil when category_class is unset —
// there's no current classification to compare flights against.
func aircraftTypeInfoFromModel(model *core.Record, manufacturerName string) *aircraftTypeInfo {
	categoryClass := model.GetString("category_class")
	if categoryClass == "" {
		return nil
	}
	return &aircraftTypeInfo{
		description:     describeModel(manufacturerName, model.GetString("model"), model.GetString("common_name")),
		categoryClass:   categoryClass,
		complex:         model.GetBool("complex"),
		highPerformance: model.GetBool("high_performance"),
		tailwheel:       model.GetBool("tailwheel"),
		engineType:      model.GetString("engine_type"),
	}
}

// aircraftModelTypeFields are the aircraft_models fields that feed
// aircraftTypeInfo — mirrors AIRCRAFT_TYPE_INFO_FIELDS's inputs in
// packages/core/src/aircraft.ts. A change to any of these on a model already
// referenced by a flight is what issue #76 notifies pilots about. A change
// to the *manufacturer's* name also changes the derived description (see
// describeModel), but that's a separate collection/trigger this pass
// deliberately leaves out of scope — the issue calls it out as an open
// question, not a requirement.
var aircraftModelTypeFields = []string{
	"model", "common_name", "category_class", "complex", "high_performance", "tailwheel", "engine_type",
}

// modelTypeFieldsChanged reports whether an aircraft_models update touched
// any field aircraftTypeInfoFromModel reads, comparing the just-saved record
// against its pre-save state (record.Original() — populated at load time and
// left untouched through the save, per PocketBase's Record.Original() docs).
func modelTypeFieldsChanged(record *core.Record) bool {
	original := record.Original()
	for _, field := range aircraftModelTypeFields {
		if record.GetString(field) != original.GetString(field) {
			return true
		}
	}
	return false
}

// pilotAircraftDrift summarizes one pilot's flights on one aircraft that
// have drifted from the aircraft's live classification — enough to build a
// notification email from.
type pilotAircraftDrift struct {
	flightCount int
	// from lists each distinct type the pilot's drifted flights were logged
	// under, most-flown first — mirrors AircraftClassificationDrift.from in
	// apps/web/src/lib/server/aircraft.ts. Usually has exactly one entry;
	// more than one means the pilot logged flights across more than one
	// prior correction to this aircraft.
	from []aircraftTypeInfo
}

// computePilotDrift groups drifted flights (all logged on one aircraft) by
// pilot, mirroring computeClassificationDrift in
// apps/web/src/lib/server/aircraft.ts fanned out across every pilot who
// flew the aircraft rather than computed for one pilot's fleet page. Flights
// that haven't drifted, or whose pilot field is blank, are skipped. Returns
// an empty map when live is nil (no current classification to compare
// against).
func computePilotDrift(flights []*core.Record, live *aircraftTypeInfo) map[string]*pilotAircraftDrift {
	result := map[string]*pilotAircraftDrift{}
	if live == nil {
		return result
	}

	type typeCount struct {
		info  aircraftTypeInfo
		count int
	}
	countsByPilot := map[string][]*typeCount{}

	for _, f := range flights {
		pilotId := f.GetString("pilot")
		if pilotId == "" {
			continue
		}
		snapshot := snapshotFromFlight(f)
		if !hasAircraftTypeDrift(snapshot, live) {
			continue
		}
		loggedType := resolveAircraftType(snapshot, live)
		if loggedType == nil {
			continue
		}

		drift, ok := result[pilotId]
		if !ok {
			drift = &pilotAircraftDrift{}
			result[pilotId] = drift
		}
		drift.flightCount++

		counts := countsByPilot[pilotId]
		found := false
		for _, tc := range counts {
			if tc.info == *loggedType {
				tc.count++
				found = true
				break
			}
		}
		if !found {
			countsByPilot[pilotId] = append(counts, &typeCount{info: *loggedType, count: 1})
		}
	}

	for pilotId, counts := range countsByPilot {
		sort.SliceStable(counts, func(i, j int) bool { return counts[i].count > counts[j].count })
		from := make([]aircraftTypeInfo, len(counts))
		for i, tc := range counts {
			from[i] = tc.info
		}
		result[pilotId].from = from
	}

	return result
}

// affectedAircraftIds returns every aircraft row currently pointed at the
// given aircraft_models row — what an aircraft_models correction needs to
// fan out to, since more than one tail can share a model.
func affectedAircraftIds(app core.App, modelId string) ([]string, error) {
	records, err := app.FindRecordsByFilter(
		"aircraft",
		"model = {:modelId}",
		"",
		0,
		0,
		dbx.Params{"modelId": modelId},
	)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(records))
	for i, r := range records {
		ids[i] = r.Id
	}
	return ids, nil
}

// aircraftChangeEmailBody renders the notification described in issue #76:
// tail number, old type(s) -> new type, how many of the pilot's flights are
// affected, and a link to review/sync — spelling out that nothing changes
// unless the pilot syncs, and that syncing may change their part 61
// currency.
func aircraftChangeEmailBody(tailNumber string, drift *pilotAircraftDrift, live aircraftTypeInfo, aircraftURL string) (subject, htmlBody string) {
	fromDescriptions := make([]string, len(drift.from))
	for i, t := range drift.from {
		fromDescriptions[i] = t.description
	}
	from := strings.Join(fromDescriptions, ", ")

	flightWord := "flight"
	if drift.flightCount != 1 {
		flightWord = "flights"
	}

	subject = fmt.Sprintf("%s has been reclassified", tailNumber)
	htmlBody = fmt.Sprintf(
		`<p>Hello,</p>`+
			`<p>The aircraft record for tail <strong>%s</strong> was updated: <strong>%s</strong> &rarr; <strong>%s</strong>.</p>`+
			`<p>%d of your logged %s on this tail %s affected.</p>`+
			`<p><strong>Nothing changes in your logbook unless you sync.</strong> You can review the change and sync your affected flights to the new classification — this may change your part 61 currency — at:</p>`+
			`<p><a href="%s">%s</a></p>`,
		html.EscapeString(tailNumber),
		html.EscapeString(from),
		html.EscapeString(live.description),
		drift.flightCount,
		flightWord,
		pluralVerb(drift.flightCount),
		aircraftURL,
		html.EscapeString(aircraftURL),
	)
	return subject, htmlBody
}

func pluralVerb(n int) string {
	if n == 1 {
		return "is"
	}
	return "are"
}

// sendAircraftChangeEmail sends one pilot the aircraft-reclassified
// notification, via the SMTP settings already configured for this
// PocketBase instance (Settings -> Mail) — the same client the built-in
// sign-in OTP emails use.
func sendAircraftChangeEmail(app core.App, to mail.Address, tailNumber string, drift *pilotAircraftDrift, live aircraftTypeInfo) error {
	aircraftURL := strings.TrimRight(app.Settings().Meta.AppURL, "/") + "/aircraft"
	subject, htmlBody := aircraftChangeEmailBody(tailNumber, drift, live, aircraftURL)

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

// notifyAircraftReclassified emails every pilot with drifted flights on the
// given aircraft that its classification has changed. Called after the
// triggering save has already committed; every error here is logged and
// swallowed rather than returned, since a failed notification must never
// fail or roll back the admin's edit (issue #76's "failure handling").
func notifyAircraftReclassified(app core.App, aircraftId string) {
	aircraft, err := app.FindRecordById("aircraft", aircraftId)
	if err != nil {
		app.Logger().Error("aircraft reclassification email: aircraft not found", "error", err, "aircraft", aircraftId)
		return
	}

	model, err := app.FindRecordById("aircraft_models", aircraft.GetString("model"))
	if err != nil {
		app.Logger().Error("aircraft reclassification email: model not found", "error", err, "aircraft", aircraftId)
		return
	}

	manufacturerName := ""
	if manufacturerId := model.GetString("manufacturer"); manufacturerId != "" {
		if manufacturer, err := app.FindRecordById("manufacturers", manufacturerId); err == nil {
			manufacturerName = manufacturer.GetString("name")
		}
	}

	live := aircraftTypeInfoFromModel(model, manufacturerName)
	if live == nil {
		return
	}

	joins, err := app.FindRecordsByFilter(
		"pilot_aircraft",
		"aircraft = {:aircraftId} && deleted != true",
		"",
		0,
		0,
		dbx.Params{"aircraftId": aircraftId},
	)
	if err != nil {
		app.Logger().Error("aircraft reclassification email: failed to find pilots", "error", err, "aircraft", aircraftId)
		return
	}
	if len(joins) == 0 {
		return
	}

	// Same set of flights hasAircraftTypeDrift/aircraftTypeDriftFields
	// considers on the fleet page — pilotAircraftFlightsFilter in
	// apps/web/src/lib/server/aircraft.ts.
	flights, err := app.FindRecordsByFilter(
		"flights",
		"aircraft = {:aircraftId} && deleted != true && is_starting_totals != true",
		"",
		0,
		0,
		dbx.Params{"aircraftId": aircraftId},
	)
	if err != nil {
		app.Logger().Error("aircraft reclassification email: failed to find flights", "error", err, "aircraft", aircraftId)
		return
	}

	drifts := computePilotDrift(flights, live)
	if len(drifts) == 0 {
		return
	}

	tailNumber := aircraft.GetString("tail_number")

	for _, join := range joins {
		pilotId := join.GetString("pilot")
		drift := drifts[pilotId]
		if drift == nil {
			continue
		}

		pilot, err := app.FindRecordById("pilots", pilotId)
		if err != nil {
			app.Logger().Error("aircraft reclassification email: pilot not found", "error", err, "pilot", pilotId)
			continue
		}
		if !pilot.GetBool("notify_aircraft_changes") {
			continue
		}

		userId := pilot.GetString("user")
		if userId == "" {
			continue
		}
		user, err := app.FindRecordById("users", userId)
		if err != nil {
			app.Logger().Error("aircraft reclassification email: user not found", "error", err, "user", userId)
			continue
		}
		email := user.Email()
		if email == "" {
			continue
		}

		if err := sendAircraftChangeEmail(app, mail.Address{Address: email}, tailNumber, drift, *live); err != nil {
			app.Logger().Error("aircraft reclassification email: send failed", "error", err, "pilot", pilotId, "aircraft", aircraftId)
		}
	}
}

// RegisterAircraftNotificationHooks emails pilots when an aircraft they've
// flown is reclassified (issue #76). Two triggers can make logged flights
// drift from an aircraft's live classification:
//
//  1. A tail (aircraft row) is reassigned to a different model.
//  2. A shared aircraft_models row is corrected in a way that changes
//     aircraftTypeInfoFromModel's output, affecting every tail on that
//     model.
//
// Sending is immediate, not batched/debounced or queued for a cron job —
// the issue leaves that choice open, and immediate is the simplest option
// that still satisfies "never fail or roll back the admin's edit": drift is
// recomputed from current data on every trigger, so a pilot who syncs (or
// an admin who reverts the change) before this hook next runs for that
// aircraft simply sees nothing to notify.
func RegisterAircraftNotificationHooks(app core.App) {
	app.OnRecordAfterUpdateSuccess("aircraft").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("model") != e.Record.Original().GetString("model") {
			notifyAircraftReclassified(e.App, e.Record.Id)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("aircraft_models").BindFunc(func(e *core.RecordEvent) error {
		if modelTypeFieldsChanged(e.Record) {
			aircraftIds, err := affectedAircraftIds(e.App, e.Record.Id)
			if err != nil {
				e.App.Logger().Error("aircraft reclassification email: failed to find affected aircraft", "error", err, "model", e.Record.Id)
			} else {
				for _, aircraftId := range aircraftIds {
					notifyAircraftReclassified(e.App, aircraftId)
				}
			}
		}
		return e.Next()
	})
}
