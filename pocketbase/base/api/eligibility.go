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

type eligibilityResponseDTO struct {
	Requirements []requirementDTO `json:"requirements"`
	FlightCount  int              `json:"flightCount"`
	// AlreadyHeld and HeldCertificateType reflect
	// eligibility.AlreadyHeldASELPrivate — see loadHeldCertificates.
	AlreadyHeld         bool   `json:"alreadyHeld"`
	HeldCertificateType string `json:"heldCertificateType,omitempty"`
}

func toRequirementDTO(r eligibility.Requirement) requirementDTO {
	return requirementDTO{
		Citation: r.Citation, Label: r.Label, Have: r.Have, Need: r.Need,
		Unit: r.Unit, Met: r.Met, NeedsManualReview: r.NeedsManualReview, Note: r.Note,
	}
}

// --- data loading ---

// loadEligibilityFlights mirrors loadFlights (currency.go), extended with
// the summable hour fields 61.109(a) needs that currency never sums —
// currency only cares about landing/approach counts, not total/dual/solo/
// night/cross-country hours.
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

	requirements := eligibility.PrivatePilotAirplaneEligibility(flights, time.Now())
	requirementDTOs := make([]requirementDTO, len(requirements))
	for i, r := range requirements {
		requirementDTOs[i] = toRequirementDTO(r)
	}

	return e.JSON(http.StatusOK, eligibilityResponseDTO{
		Requirements:        requirementDTOs,
		FlightCount:         len(flights),
		AlreadyHeld:         alreadyHeld,
		HeldCertificateType: heldCertificateType,
	})
}
