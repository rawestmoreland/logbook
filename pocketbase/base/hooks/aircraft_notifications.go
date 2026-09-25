// Package hooks holds custom PocketBase record hooks for this backend.
package hooks

import (
	"fmt"
	"html"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"

	"logbook/currency"
)

// aircraftModelTypeFields are the aircraft_models fields that feed
// currency.AircraftTypeInfo — the same inputs currency.AircraftTypeInfoFromModel
// reads off a model row. A change to any of these on a model already
// referenced by a flight is what issue #76 notifies pilots about. A change
// to the *manufacturer's* name also changes the derived description (see
// currency.DescribeModel) for any model with no common_name — that's handled
// by the separate "manufacturers" hook registered in
// RegisterAircraftNotificationHooks below.
var aircraftModelTypeFields = []string{
	"model", "common_name", "category_class", "complex", "high_performance", "tailwheel", "engine_type",
}

// modelTypeFieldsChanged reports whether an aircraft_models update touched
// any field currency.AircraftTypeInfoFromModel reads, comparing the just-saved record
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
	from []currency.AircraftTypeInfo
}

// defaultNotificationGuardWindow is how long notifyAircraftsReclassified
// waits before re-notifying the same pilot about the same aircraft's drift —
// issue #78's "short-lived guard": cheap insurance against an admin's
// repeated saves (typos, a multi-step edit) each sending their own email,
// without standing up a queue/cron system. It's process-local (lost on
// restart/redeploy) and deliberately short-lived: drift is still recomputed
// fresh from current data on every trigger (see notifyAircraftsReclassified),
// so there's never a stale send to guard against — only a duplicate one.
const defaultNotificationGuardWindow = 15 * time.Minute

// notificationGuard suppresses re-notifying the same pilot+aircraft pair
// within a short window, collapsing repeated saves of the same record (or of
// a shared aircraft_models row) into a single email per pair. Safe for
// concurrent use; now is overridable so tests can simulate the window
// elapsing without sleeping.
type notificationGuard struct {
	mu   sync.Mutex
	sent map[string]time.Time
	ttl  time.Duration
	now  func() time.Time
}

func newNotificationGuard(ttl time.Duration) *notificationGuard {
	return &notificationGuard{sent: map[string]time.Time{}, ttl: ttl, now: time.Now}
}

// shouldNotify reports whether key hasn't already been notified within the
// guard's window, and if so records this moment as its latest notification —
// callers must only call this once they're actually about to send, since a
// true result consumes the window.
func (g *notificationGuard) shouldNotify(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := g.now()
	if last, ok := g.sent[key]; ok && now.Sub(last) < g.ttl {
		return false
	}
	g.sent[key] = now
	return true
}

// computePilotDrift groups drifted flights (all logged on one aircraft) by
// pilot, using currency.ComputeClassificationDrift — the same rule
// apps/web/src/lib/server/aircraft.ts's fleet page and pilot-initiated sync
// now call over HTTP (issue #93) — fanned out across every pilot who flew
// the aircraft rather than computed for one pilot's fleet page. Flights
// whose pilot field is blank are skipped. Returns an empty map when live is
// nil (no current classification to compare against).
func computePilotDrift(flights []*core.Record, live *currency.AircraftTypeInfo) map[string]*pilotAircraftDrift {
	result := map[string]*pilotAircraftDrift{}
	if live == nil {
		return result
	}

	flightsByPilot := map[string][]*core.Record{}
	var pilotOrder []string
	for _, f := range flights {
		pilotId := f.GetString("pilot")
		if pilotId == "" {
			continue
		}
		if _, ok := flightsByPilot[pilotId]; !ok {
			pilotOrder = append(pilotOrder, pilotId)
		}
		flightsByPilot[pilotId] = append(flightsByPilot[pilotId], f)
	}

	for _, pilotId := range pilotOrder {
		drift := currency.ComputeClassificationDrift(live, flightsByPilot[pilotId])
		if drift == nil {
			continue
		}
		from := make([]currency.AircraftTypeInfo, len(drift.From))
		for i, g := range drift.From {
			from[i] = g.Type
		}
		result[pilotId] = &pilotAircraftDrift{flightCount: drift.FlightCount, from: from}
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

// affectedAircraftIdsForManufacturer returns every aircraft row whose
// model belongs to the given manufacturer — what a manufacturer rename
// needs to fan out to, since describeModel's output depends on the
// manufacturer's name for any model with no common_name.
func affectedAircraftIdsForManufacturer(app core.App, manufacturerId string) ([]string, error) {
	records, err := app.FindRecordsByFilter(
		"aircraft",
		"model.manufacturer = {:manufacturerId}",
		"",
		0,
		0,
		dbx.Params{"manufacturerId": manufacturerId},
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
func aircraftChangeEmailBody(tailNumber string, drift *pilotAircraftDrift, live currency.AircraftTypeInfo, aircraftURL string) (subject, htmlBody string) {
	fromDescriptions := make([]string, len(drift.from))
	for i, t := range drift.from {
		fromDescriptions[i] = t.Description
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
		html.EscapeString(live.Description),
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

// pilotDigestEntry is one aircraft's drift for one pilot, gathered while
// notifyAircraftsReclassified batches a trigger's affected aircraft into a
// single email per pilot instead of one email per aircraft.
type pilotDigestEntry struct {
	tailNumber string
	live       currency.AircraftTypeInfo
	drift      *pilotAircraftDrift
}

// aircraftChangeDigestEmailBody renders one pilot's notification covering
// every tail notifyAircraftsReclassified batched for them. With exactly one
// entry — the common case — it reads identically to aircraftChangeEmailBody;
// with more, it lists each tail's change instead of picking one.
func aircraftChangeDigestEmailBody(entries []pilotDigestEntry, aircraftURL string) (subject, htmlBody string) {
	if len(entries) == 1 {
		e := entries[0]
		return aircraftChangeEmailBody(e.tailNumber, e.drift, e.live, aircraftURL)
	}

	var rows strings.Builder
	for _, e := range entries {
		fromDescriptions := make([]string, len(e.drift.from))
		for i, t := range e.drift.from {
			fromDescriptions[i] = t.Description
		}
		flightWord := "flight"
		if e.drift.flightCount != 1 {
			flightWord = "flights"
		}
		rows.WriteString(fmt.Sprintf(
			`<li><strong>%s</strong>: <strong>%s</strong> &rarr; <strong>%s</strong> (%d logged %s %s affected)</li>`,
			html.EscapeString(e.tailNumber),
			html.EscapeString(strings.Join(fromDescriptions, ", ")),
			html.EscapeString(e.live.Description),
			e.drift.flightCount,
			flightWord,
			pluralVerb(e.drift.flightCount),
		))
	}

	subject = fmt.Sprintf("%d of your aircraft have been reclassified", len(entries))
	htmlBody = fmt.Sprintf(
		`<p>Hello,</p>`+
			`<p>%d aircraft you've logged flights on were updated:</p>`+
			`<ul>%s</ul>`+
			`<p><strong>Nothing changes in your logbook unless you sync.</strong> You can review each change and sync your affected flights to the new classification — this may change your part 61 currency — at:</p>`+
			`<p><a href="%s">%s</a></p>`,
		len(entries),
		rows.String(),
		aircraftURL,
		html.EscapeString(aircraftURL),
	)
	return subject, htmlBody
}

// sendAircraftChangeDigestEmail sends one pilot their batched
// aircraft-reclassified notification, via the SMTP settings already
// configured for this PocketBase instance (Settings -> Mail) — the same
// client the built-in sign-in OTP emails use.
func sendAircraftChangeDigestEmail(app core.App, to mail.Address, entries []pilotDigestEntry) error {
	aircraftURL := strings.TrimRight(app.Settings().Meta.AppURL, "/") + "/aircraft"
	subject, htmlBody := aircraftChangeDigestEmailBody(entries, aircraftURL)

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

// resolvePilotEmail looks up whether a pilot should be emailed (opted in,
// with a resolvable user email), caching both positive and negative results
// in cache so a batch spanning several aircraft only looks a pilot up once.
// A cached negative result never blocks a later true send: it's only ever
// consulted again within the same batch/cache, not across guard windows.
func resolvePilotEmail(app core.App, cache map[string]mail.Address, pilotId string) (mail.Address, bool) {
	if addr, ok := cache[pilotId]; ok {
		return addr, addr.Address != ""
	}

	pilot, err := app.FindRecordById("pilots", pilotId)
	if err != nil {
		app.Logger().Error("aircraft reclassification email: pilot not found", "error", err, "pilot", pilotId)
		return mail.Address{}, false
	}
	if !pilot.GetBool("notify_aircraft_changes") {
		cache[pilotId] = mail.Address{}
		return mail.Address{}, false
	}

	userId := pilot.GetString("user")
	if userId == "" {
		cache[pilotId] = mail.Address{}
		return mail.Address{}, false
	}
	user, err := app.FindRecordById("users", userId)
	if err != nil {
		app.Logger().Error("aircraft reclassification email: user not found", "error", err, "user", userId)
		return mail.Address{}, false
	}
	email := user.Email()
	if email == "" {
		cache[pilotId] = mail.Address{}
		return mail.Address{}, false
	}

	addr := mail.Address{Address: email}
	cache[pilotId] = addr
	return addr, true
}

// notifyAircraftsReclassified emails every pilot with drifted flights on any
// of the given aircraft that its classification has changed — one email per
// pilot covering every affected tail in this batch, not one per aircraft
// (issue #78: a single aircraft_models edit can affect several tails of the
// same model, and every pilot flying more than one of them previously got
// one email per tail). guard additionally suppresses re-notifying a pilot
// about an aircraft they were already notified about within its window, so
// an admin re-saving the same record a few times in a row (typos, a
// multi-step edit) also collapses into a single send. Called after the
// triggering save has already committed; every error here is logged and
// swallowed rather than returned, since a failed notification must never
// fail or roll back the admin's edit (issue #76's "failure handling").
// Drift is still recomputed from current data on every call, so there's no
// gap in which a stale notification could go out.
func notifyAircraftsReclassified(app core.App, guard *notificationGuard, aircraftIds []string) {
	entriesByPilot := map[string][]pilotDigestEntry{}
	emailCache := map[string]mail.Address{}

	for _, aircraftId := range aircraftIds {
		aircraft, err := app.FindRecordById("aircraft", aircraftId)
		if err != nil {
			app.Logger().Error("aircraft reclassification email: aircraft not found", "error", err, "aircraft", aircraftId)
			continue
		}

		model, err := app.FindRecordById("aircraft_models", aircraft.GetString("model"))
		if err != nil {
			app.Logger().Error("aircraft reclassification email: model not found", "error", err, "aircraft", aircraftId)
			continue
		}

		manufacturerName := ""
		if manufacturerId := model.GetString("manufacturer"); manufacturerId != "" {
			if manufacturer, err := app.FindRecordById("manufacturers", manufacturerId); err == nil {
				manufacturerName = manufacturer.GetString("name")
			}
		}

		live := currency.AircraftTypeInfoFromModel(model, manufacturerName)
		if live == nil {
			continue
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
			continue
		}
		if len(joins) == 0 {
			continue
		}

		// Same set of flights currency.HasAircraftTypeDrift/aircraftTypeDriftFields
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
			continue
		}

		drifts := computePilotDrift(flights, live)
		if len(drifts) == 0 {
			continue
		}

		tailNumber := aircraft.GetString("tail_number")

		for _, join := range joins {
			pilotId := join.GetString("pilot")
			drift := drifts[pilotId]
			if drift == nil {
				continue
			}

			if _, ok := resolvePilotEmail(app, emailCache, pilotId); !ok {
				continue
			}
			if !guard.shouldNotify(pilotId + "|" + aircraftId) {
				continue
			}

			entriesByPilot[pilotId] = append(entriesByPilot[pilotId], pilotDigestEntry{
				tailNumber: tailNumber,
				live:       *live,
				drift:      drift,
			})
		}
	}

	for pilotId, entries := range entriesByPilot {
		to, ok := emailCache[pilotId]
		if !ok || to.Address == "" || len(entries) == 0 {
			continue
		}
		if err := sendAircraftChangeDigestEmail(app, to, entries); err != nil {
			app.Logger().Error("aircraft reclassification email: send failed", "error", err, "pilot", pilotId)
		}
	}
}

// RegisterAircraftNotificationHooks emails pilots when an aircraft they've
// flown is reclassified (issue #76). Three triggers can make logged flights
// drift from an aircraft's live classification:
//
//  1. A tail (aircraft row) is reassigned to a different model.
//  2. A shared aircraft_models row is corrected in a way that changes
//     currency.AircraftTypeInfoFromModel's output, affecting every tail on that
//     model.
//  3. A manufacturer is renamed, which changes currency.DescribeModel's
//     output (and so AircraftTypeInfoFromModel's Description) for every one
//     of its models that has no common_name, affecting every tail under any
//     of those models.
//
// Sending is still immediate, not queued for a cron job — the issue's
// "short-lived guard" option, plus batching each trigger's affected aircraft
// into one email per pilot (see notifyAircraftsReclassified), is enough to
// dedupe repeated saves and multi-tail fan-out (issue #78) without a
// queue/cron system. guard is shared across all three hooks and lives for
// the app's process lifetime, so it also dedupes across the three trigger
// paths.
func RegisterAircraftNotificationHooks(app core.App) {
	guard := newNotificationGuard(defaultNotificationGuardWindow)

	app.OnRecordAfterUpdateSuccess("aircraft").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("model") != e.Record.Original().GetString("model") {
			notifyAircraftsReclassified(e.App, guard, []string{e.Record.Id})
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("aircraft_models").BindFunc(func(e *core.RecordEvent) error {
		if modelTypeFieldsChanged(e.Record) {
			aircraftIds, err := affectedAircraftIds(e.App, e.Record.Id)
			if err != nil {
				e.App.Logger().Error("aircraft reclassification email: failed to find affected aircraft", "error", err, "model", e.Record.Id)
			} else {
				notifyAircraftsReclassified(e.App, guard, aircraftIds)
			}
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("manufacturers").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("name") != e.Record.Original().GetString("name") {
			aircraftIds, err := affectedAircraftIdsForManufacturer(e.App, e.Record.Id)
			if err != nil {
				e.App.Logger().Error("aircraft reclassification email: failed to find affected aircraft", "error", err, "manufacturer", e.Record.Id)
			} else {
				notifyAircraftsReclassified(e.App, guard, aircraftIds)
			}
		}
		return e.Next()
	})
}
