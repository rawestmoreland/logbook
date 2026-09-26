package api

import (
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"logbook/currency"
	"logbook/eligibility"
)

// --- wire types ---
//
// eligibility.Requirement carries no dates, so unlike currencyResultDTO
// there's nothing to reformat here — this DTO mirrors the Go struct's JSON
// tags directly.

type requirementDTO struct {
	Citation          string  `json:"citation"`
	Label             string  `json:"label"`
	Have              float64 `json:"have"`
	Need              float64 `json:"need"`
	Unit              string  `json:"unit"`
	Met               bool    `json:"met"`
	NeedsManualReview bool    `json:"needsManualReview"`
	Note              string  `json:"note,omitempty"`
}

// ratingChecklistDTO is one certificate/rating's computed checklist —
// PrivatePilotAirplaneEligibility, InstrumentAirplaneEligibility,
// CommercialAirplaneEligibility, or any sibling checklist this package's
// eligibility functions add later.
type ratingChecklistDTO struct {
	// ID is a stable slug for the checklist, e.g. "private_pilot_asel" or
	// "instrument_airplane" — not currently read by the web client, but
	// kept distinct from Title so a display-name change doesn't also change
	// a value a future caller might key off of.
	ID           string           `json:"id"`
	Title        string           `json:"title"`
	Requirements []requirementDTO `json:"requirements"`
	// AlreadyHeld and HeldCertificateType reflect
	// eligibility.AlreadyHeldASELPrivate for the private-pilot checklist —
	// see loadHeldCertificates. Instrument's checklist always reports
	// AlreadyHeld: false; see eligibilityHandler.
	AlreadyHeld         bool   `json:"alreadyHeld"`
	HeldCertificateType string `json:"heldCertificateType,omitempty"`
}

type eligibilityResponseDTO struct {
	FlightCount int                  `json:"flightCount"`
	Checklists  []ratingChecklistDTO `json:"checklists"`
}

func toRequirementDTO(r eligibility.Requirement) requirementDTO {
	return requirementDTO{
		Citation: r.Citation, Label: r.Label, Have: r.Have, Need: r.Need,
		Unit: r.Unit, Met: r.Met, NeedsManualReview: r.NeedsManualReview, Note: r.Note,
	}
}

// --- data loading ---

// loadEligibilityFlights mirrors loadFlights (currency.go), extended with
// the summable hour fields 61.109(a), 61.65(d), and 61.129(a) need that
// currency never sums — currency only cares about landing/approach counts
// and complex/engine-type booleans/strings for its own purposes, not
// total/dual/solo/night/cross-country/PIC/instrument hours.
func loadEligibilityFlights(app core.App, pilotId string) ([]eligibility.Flight, error) {
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

	result := make([]eligibility.Flight, 0, len(records))
	for _, f := range records {
		aircraft := f.ExpandedOne("aircraft")
		if aircraft == nil {
			continue
		}
		var live *currency.AircraftTypeInfo
		if model := aircraft.ExpandedOne("model"); model != nil {
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

		result = append(result, eligibility.Flight{
			ID: f.Id, Date: dateOnly(f, "date"), CategoryClass: resolved.CategoryClass,
			InstanceType:          instanceType,
			TotalTime:             f.GetFloat("total_time"),
			DualTime:              f.GetFloat("dual_time"),
			SoloTime:              f.GetFloat("solo_time"),
			NightTime:             f.GetFloat("night_time"),
			CrossCountryTime:      f.GetFloat("cross_country_time"),
			NightLandingsFullStop: f.GetInt("night_landings_full_stop"),
			PICTime:               f.GetFloat("pic_time"),
			ActualInstrument:      f.GetFloat("actual_instrument"),
			SimInstrument:         f.GetFloat("sim_instrument"),
			Complex:               resolved.Complex,
			EngineType:            resolved.EngineType,
		})
	}
	return result, nil
}

// loadHeldCertificates fetches the signed-in pilot's non-deleted
// pilot_certificates rows whose certificate_type could plausibly evidence
// already-held private-pilot-or-higher ASEL privileges, and converts them to
// eligibility.HeldCertificate — eligibility.AlreadyHeldASELPrivate does the
// actual (fail-safe) evidence check.
func loadHeldCertificates(app core.App, pilotId string) ([]eligibility.HeldCertificate, error) {
	records, err := app.FindRecordsByFilter(
		"pilot_certificates",
		"pilot = {:pilotId} && deleted != true && (certificate_type = \"private\" || certificate_type = \"commercial\" || certificate_type = \"atp\")",
		"", 0, 0,
		dbx.Params{"pilotId": pilotId},
	)
	if err != nil {
		return nil, err
	}

	result := make([]eligibility.HeldCertificate, len(records))
	for i, r := range records {
		result[i] = eligibility.HeldCertificate{
			CertificateType: r.GetString("certificate_type"),
			CategoryClasses: r.GetStringSlice("category_classes"),
		}
	}
	return result, nil
}

func eligibilityHandler(e *core.RequestEvent) error {
	pilot, err := findPilotForUser(e.App, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("no pilot profile found for this account", err)
	}

	flights, err := loadEligibilityFlights(e.App, pilot.Id)
	if err != nil {
		return e.InternalServerError("failed to load flights", err)
	}

	heldCertificates, err := loadHeldCertificates(e.App, pilot.Id)
	if err != nil {
		return e.InternalServerError("failed to load pilot certificates", err)
	}
	heldCertificateType, alreadyHeld := eligibility.AlreadyHeldASELPrivate(heldCertificates)
	heldCommercialCertificateType, alreadyHeldCommercial := eligibility.AlreadyHeldASELCommercial(heldCertificates)

	asOf := time.Now()

	privateRequirements := eligibility.PrivatePilotAirplaneEligibility(flights, asOf)
	instrumentRequirements := eligibility.InstrumentAirplaneEligibility(flights, asOf)
	commercialRequirements := eligibility.CommercialAirplaneEligibility(flights, asOf)

	return e.JSON(http.StatusOK, eligibilityResponseDTO{
		FlightCount: len(flights),
		Checklists: []ratingChecklistDTO{
			{
				ID:                  "private_pilot_asel",
				Title:               "Private Pilot — Airplane Single-Engine Land",
				Requirements:        toRequirementDTOs(privateRequirements),
				AlreadyHeld:         alreadyHeld,
				HeldCertificateType: heldCertificateType,
			},
			{
				ID:    "instrument_airplane",
				Title: "Instrument Rating — Airplane",
				// AlreadyHeld is always false here: pilot_certificates has
				// no structured field for an instrument rating to check
				// against — see pocketbase/base/eligibility's package doc
				// comment and this feature's task notes for why that's a
				// deliberate gap rather than a guess.
				Requirements: toRequirementDTOs(instrumentRequirements),
				AlreadyHeld:  false,
			},
			{
				ID:                  "commercial_pilot_asel",
				Title:               "Commercial Pilot — Airplane Single-Engine Land",
				Requirements:        toRequirementDTOs(commercialRequirements),
				AlreadyHeld:         alreadyHeldCommercial,
				HeldCertificateType: heldCommercialCertificateType,
			},
		},
	})
}

func toRequirementDTOs(requirements []eligibility.Requirement) []requirementDTO {
	dtos := make([]requirementDTO, len(requirements))
	for i, r := range requirements {
		dtos[i] = toRequirementDTO(r)
	}
	return dtos
}
