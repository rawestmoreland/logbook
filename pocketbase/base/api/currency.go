// Package api holds JSON HTTP endpoints for apps/web (TanStack Start), as
// opposed to web/, which is a separate server-rendered HTML/htmx app with
// its own cookie-based auth. Routes here are authenticated the way apps/web
// already talks to PocketBase everywhere else: the PocketBase JS SDK sends
// the auth token from pb.authStore as a standard Authorization header,
// checked by apis.RequireAuth().
package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"logbook/currency"
)

func RegisterRoutes(app core.App, se *core.ServeEvent) {
	se.Router.GET("/api/currency", currencyHandler).Bind(apis.RequireAuth())
	se.Router.GET("/api/eligibility", eligibilityHandler).Bind(apis.RequireAuth())
	se.Router.GET("/api/aircraft/drift", aircraftDriftHandler).Bind(apis.RequireAuth())
	// admin.go's handlers additionally require pilots.is_admin themselves —
	// apis.RequireAuth() here only ensures e.Auth is populated to check it.
	se.Router.POST("/api/admin/merge-manufacturers", mergeManufacturersHandler).Bind(apis.RequireAuth())
	se.Router.POST("/api/admin/merge-models", mergeModelsHandler).Bind(apis.RequireAuth())
}

// --- wire types ---
//
// currency.CurrencyResult carries time.Time for internal (Go-side) use;
// these DTOs convert dates to plain "YYYY-MM-DD" strings, the format
// @logbook/core's parseDateValue (still used by the web client) expects.

type currencyResultDTO struct {
	Rule          string               `json:"rule"`
	Label         string               `json:"label"`
	State         string               `json:"state"`
	Have          int                  `json:"have"`
	Need          int                  `json:"need"`
	ExpiresOn     *string              `json:"expiresOn"`
	DaysRemaining *int                 `json:"daysRemaining"`
	Qualifying    []qualifyingEventDTO `json:"qualifying"`
	Action        *string              `json:"action"`
}

type qualifyingEventDTO struct {
	FlightID  string `json:"flightId"`
	Date      string `json:"date"`
	Counts    int    `json:"counts"`
	AgesOutOn string `json:"agesOutOn"`
}

type passengerGroupDTO struct {
	CategoryClass string              `json:"categoryClass"`
	Results       []currencyResultDTO `json:"results"`
}

type instrumentGroupDTO struct {
	Category string            `json:"category"`
	Result   currencyResultDTO `json:"result"`
}

type flightDTO struct {
	ID         string `json:"id"`
	Date       string `json:"date"`
	TailNumber string `json:"tailNumber"`
	RouteFrom  string `json:"routeFrom"`
	RouteTo    string `json:"routeTo"`
}

type currencyResponseDTO struct {
	IsEasa          bool                 `json:"isEasa"`
	Passenger       []passengerGroupDTO  `json:"passenger"`
	Instrument      []instrumentGroupDTO `json:"instrument"`
	Review          currencyResultDTO    `json:"review"`
	Medical         *currencyResultDTO   `json:"medical"`
	MedicalReason   string               `json:"medicalReason,omitempty"`
	MedicalSublabel string               `json:"medicalSublabel,omitempty"`
	Flights         []flightDTO          `json:"flights"`
}

func dateStr(t time.Time) string { return t.Format("2006-01-02") }

func toResultDTO(r currency.CurrencyResult) currencyResultDTO {
	qualifying := make([]qualifyingEventDTO, len(r.Qualifying))
	for i, q := range r.Qualifying {
		qualifying[i] = qualifyingEventDTO{FlightID: q.FlightID, Date: dateStr(q.Date), Counts: q.Counts, AgesOutOn: dateStr(q.AgesOutOn)}
	}
	var expiresOn *string
	if r.ExpiresOn != nil {
		s := dateStr(*r.ExpiresOn)
		expiresOn = &s
	}
	return currencyResultDTO{
		Rule: r.Rule, Label: r.Label, State: string(r.State), Have: r.Have, Need: r.Need,
		ExpiresOn: expiresOn, DaysRemaining: r.DaysRemaining, Qualifying: qualifying, Action: r.Action,
	}
}

// --- data loading ---

func findPilotForUser(app core.App, userId string) (*core.Record, error) {
	return app.FindFirstRecordByData("pilots", "user", userId)
}

// dateOnly reads a PocketBase date field as a local-midnight time.Time, the
// same "YYYY-MM-DD" slice apps/web/src/lib/server/currency.ts takes off the
// wire string before handing dates to the currency rule functions. Returns
// the zero Time when unset.
func dateOnly(r *core.Record, field string) time.Time {
	s := r.GetString(field)
	if len(s) < 10 {
		return time.Time{}
	}
	t, err := time.ParseInLocation("2006-01-02", s[:10], time.Local)
	if err != nil {
		return time.Time{}
	}
	return t
}

func dateOnlyPtr(r *core.Record, field string) *time.Time {
	s := r.GetString(field)
	if len(s) < 10 {
		return nil
	}
	t := dateOnly(r, field)
	if t.IsZero() {
		return nil
	}
	return &t
}

// resolvedFlight is one loaded flight plus the currency-relevant fields
// derived from it (its resolved aircraft type and display metadata for the
// "what carries your currency" ledger).
type resolvedFlight struct {
	flight     currency.CurrencyFlight
	tailNumber string
	routeFrom  string
	routeTo    string
}

func loadFlights(app core.App, pilotId string) ([]resolvedFlight, error) {
	records, err := app.FindRecordsByFilter(
		"flights",
		"pilot = {:pilotId} && deleted != true && pending != true",
		"",
		0, 0,
		dbx.Params{"pilotId": pilotId},
	)
	if err != nil {
		return nil, err
	}
	app.ExpandRecords(records, []string{"aircraft.model"}, nil)

	result := make([]resolvedFlight, 0, len(records))
	for _, f := range records {
		aircraft := f.ExpandedOne("aircraft")
		if aircraft == nil {
			continue
		}
		var live *currency.AircraftTypeInfo
		if model := aircraft.ExpandedOne("model"); model != nil {
			// manufacturerName defaults to "" here, same as
			// getCurrencyData's toAircraftTypeInfo(model) call — the
			// currency page never expands aircraft.model.manufacturer,
			// since currency results don't surface the aircraft's
			// description text.
			live = currency.AircraftTypeInfoFromModel(model, "")
		}
		snapshot := currency.SnapshotFromFlight(f)
		resolved := currency.ResolveAircraftType(snapshot, live)
		if resolved == nil {
			continue
		}

		instanceType := aircraft.GetString("instance_type")
		if instanceType == "" {
			instanceType = "real"
		}

		result = append(result, resolvedFlight{
			flight: currency.CurrencyFlight{
				ID: f.Id, Date: dateOnly(f, "date"), CategoryClass: resolved.CategoryClass,
				Tailwheel: resolved.Tailwheel, InstanceType: instanceType,
				TotalLandings: f.GetInt("total_landings"), DayLandingsFullStop: f.GetInt("day_landings_full_stop"),
				NightLandingsFullStop: f.GetInt("night_landings_full_stop"), Approaches: f.GetInt("approaches"),
				Holding: f.GetBool("holding"), CourseTracking: f.GetBool("course_tracking"),
			},
			tailNumber: aircraft.GetString("tail_number"),
			routeFrom:  f.GetString("route_from"),
			routeTo:    f.GetString("route_to"),
		})
	}
	return result, nil
}

// latestEndorsementDate mirrors getLatestEndorsementDate in
// apps/web/src/lib/server/endorsements.ts — the pilot's most recent
// endorsement of `endorsementType`, pilot-wide (flight_review/checkride).
func latestEndorsementDate(app core.App, pilotId, endorsementType string) (*time.Time, error) {
	records, err := app.FindRecordsByFilter(
		"endorsements",
		"flight.pilot = {:pilotId} && type = {:type} && deleted != true",
		"-date",
		1, 0,
		dbx.Params{"pilotId": pilotId, "type": endorsementType},
	)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}
	t := dateOnly(records[0], "date")
	return &t, nil
}

// latestIpcDatesByCategory mirrors getLatestIpcDate in
// apps/web/src/lib/server/endorsements.ts, computed for every category in
// one pass instead of one query per category: walks the pilot's `ipc`
// endorsements newest-first, resolving each one's flight's aircraft type
// (frozen snapshot preferred over live, same as loadFlights), and keeps the
// first (i.e. latest) match per category.
func latestIpcDatesByCategory(app core.App, pilotId string) (map[string]time.Time, error) {
	records, err := app.FindRecordsByFilter(
		"endorsements",
		`flight.pilot = {:pilotId} && type = "ipc" && deleted != true`,
		"-date",
		0, 0,
		dbx.Params{"pilotId": pilotId},
	)
	if err != nil {
		return nil, err
	}
	app.ExpandRecords(records, []string{"flight.aircraft.model"}, nil)

	result := map[string]time.Time{}
	for _, e := range records {
		flight := e.ExpandedOne("flight")
		if flight == nil {
			continue
		}
		aircraft := flight.ExpandedOne("aircraft")
		var live *currency.AircraftTypeInfo
		if aircraft != nil {
			if model := aircraft.ExpandedOne("model"); model != nil {
				live = currency.AircraftTypeInfoFromModel(model, "")
			}
		}
		snapshot := currency.SnapshotFromFlight(flight)
		resolved := currency.ResolveAircraftType(snapshot, live)
		if resolved == nil {
			continue
		}
		category := currency.CategoryOf(resolved.CategoryClass)
		if category == "" {
			continue
		}
		if _, ok := result[category]; !ok {
			result[category] = dateOnly(e, "date")
		}
	}
	return result, nil
}

// jurisdictionOf mirrors jurisdictionOf in apps/web/src/lib/server/pilots.ts
// — reads the pilot's regulatory_profile.rules.code, defaulting to "faa".
func jurisdictionOf(app core.App, pilot *core.Record) string {
	profileId := pilot.GetString("regulatory_profile")
	if profileId == "" {
		return "faa"
	}
	profile, err := app.FindRecordById("regulatory_profiles", profileId)
	if err != nil {
		return "faa"
	}
	var rules struct {
		Code string `json:"code"`
	}
	if err := profile.UnmarshalJSONField("rules", &rules); err != nil {
		return "faa"
	}
	if rules.Code != "easa" {
		return "faa"
	}
	return "easa"
}

// ageAt returns whole years old at `at`.
func ageAt(birthdate, at time.Time) int {
	age := at.Year() - birthdate.Year()
	hadBirthdayThisYear := at.Month() > birthdate.Month() ||
		(at.Month() == birthdate.Month() && at.Day() >= birthdate.Day())
	if !hadBirthdayThisYear {
		age--
	}
	return age
}

func currencyHandler(e *core.RequestEvent) error {
	pilot, err := findPilotForUser(e.App, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("no pilot profile found for this account", err)
	}

	resolvedFlights, err := loadFlights(e.App, pilot.Id)
	if err != nil {
		return e.InternalServerError("failed to load flights", err)
	}

	flights := make([]currency.CurrencyFlight, len(resolvedFlights))
	for i, rf := range resolvedFlights {
		flights[i] = rf.flight
	}

	asOf := time.Now()

	categoryClassSet := map[string]bool{}
	for _, f := range flights {
		categoryClassSet[f.CategoryClass] = true
	}
	categoryClasses := make([]string, 0, len(categoryClassSet))
	for cc := range categoryClassSet {
		categoryClasses = append(categoryClasses, cc)
	}
	sort.Strings(categoryClasses)

	categorySet := map[string]bool{}
	for _, cc := range categoryClasses {
		categorySet[currency.CategoryOf(cc)] = true
	}
	categories := make([]string, 0, len(categorySet))
	for _, c := range currency.Categories {
		if categorySet[c] {
			categories = append(categories, c)
		}
	}

	jurisdiction := jurisdictionOf(e.App, pilot)
	isEasa := jurisdiction == "easa"

	passenger := make([]passengerGroupDTO, 0, len(categoryClasses))
	for _, cc := range categoryClasses {
		var results []currencyResultDTO
		if isEasa {
			results = []currencyResultDTO{
				toResultDTO(currency.EasaRecencyCurrency(flights, asOf, cc, "")),
				toResultDTO(currency.EasaNightPicCurrency(flights, asOf, cc, "")),
			}
		} else {
			results = []currencyResultDTO{
				toResultDTO(currency.DayPassengerCurrency(flights, asOf, cc, "")),
				toResultDTO(currency.NightPassengerCurrency(flights, asOf, cc, "")),
			}
		}
		passenger = append(passenger, passengerGroupDTO{CategoryClass: cc, Results: results})
	}

	ipcDates, err := latestIpcDatesByCategory(e.App, pilot.Id)
	if err != nil {
		return e.InternalServerError("failed to load IPC endorsements", err)
	}

	instrument := make([]instrumentGroupDTO, 0, len(categories))
	for _, category := range categories {
		// instrumentCurrency is scoped per category, not class — any class
		// within the category resolves the same result, so the first one
		// flown in it stands in for the category as a whole.
		var representative string
		for _, cc := range categoryClasses {
			if currency.CategoryOf(cc) == category {
				representative = cc
				break
			}
		}
		var lastIpc *time.Time
		if t, ok := ipcDates[category]; ok {
			lastIpc = &t
		}
		instrument = append(instrument, instrumentGroupDTO{
			Category: category,
			Result:   toResultDTO(currency.InstrumentCurrency(flights, asOf, representative, lastIpc)),
		})
	}

	lastReview, err := latestEndorsementDate(e.App, pilot.Id, "flight_review")
	if err != nil {
		return e.InternalServerError("failed to load flight review endorsements", err)
	}
	lastCheckride, err := latestEndorsementDate(e.App, pilot.Id, "checkride")
	if err != nil {
		return e.InternalServerError("failed to load checkride endorsements", err)
	}
	review := toResultDTO(currency.FlightReviewCurrency(lastReview, lastCheckride, asOf))

	var medical *currencyResultDTO
	medicalReason := ""
	medicalSublabel := ""

	isBasicMed := !isEasa && pilot.GetString("medical_pathway") == "basicmed"

	switch {
	case isEasa:
		birthdate := dateOnlyPtr(pilot, "birthdate")
		issued := dateOnlyPtr(pilot, "easa_medical_issued")
		cls := pilot.GetString("easa_medical_class")
		r := toResultDTO(currency.EasaMedicalCurrency(birthdate, issued, cls, asOf))
		medical = &r
		if label, ok := currency.EasaMedicalClassLabels[cls]; ok {
			medicalSublabel = label + " certificate issued"
		}
	case isBasicMed:
		r := toResultDTO(currency.BasicMedCurrency(
			dateOnlyPtr(pilot, "basicmed_course_completed"),
			dateOnlyPtr(pilot, "basicmed_exam_completed"),
			asOf,
		))
		medical = &r
	default:
		medicalClass := pilot.GetString("medical_class")
		medicalIssued := dateOnlyPtr(pilot, "medical_issued")
		birthdate := dateOnlyPtr(pilot, "birthdate")
		if medicalClass != "" && medicalIssued != nil && birthdate != nil {
			r := toResultDTO(currency.MedicalCurrency(medicalIssued, medicalClass, ageAt(*birthdate, *medicalIssued), asOf, "third"))
			medical = &r
			if medicalClass != "third" {
				if label, ok := currency.MedicalClassLabels[medicalClass]; ok {
					medicalSublabel = label + " certificate issued"
				}
			}
		} else {
			medicalReason = "missing_faa_medical_fields"
		}
	}

	flightDTOs := make([]flightDTO, len(resolvedFlights))
	for i, rf := range resolvedFlights {
		flightDTOs[i] = flightDTO{
			ID: rf.flight.ID, Date: dateStr(rf.flight.Date), TailNumber: rf.tailNumber,
			RouteFrom: rf.routeFrom, RouteTo: rf.routeTo,
		}
	}

	return e.JSON(http.StatusOK, currencyResponseDTO{
		IsEasa: isEasa, Passenger: passenger, Instrument: instrument, Review: review,
		Medical: medical, MedicalReason: medicalReason, MedicalSublabel: medicalSublabel,
		Flights: flightDTOs,
	})
}
