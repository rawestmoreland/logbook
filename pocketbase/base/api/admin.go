package api

import (
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// admin.go holds the catalog-merge tooling for issue #92: an admin picks a
// losing and surviving manufacturers/aircraft_models row that turned out to
// be duplicates, and this repoints every reference before deleting the
// loser. Gated by pilots.is_admin (see requireAdminPilot) rather than
// PocketBase's own superuser auth — apps/web talks to PocketBase as a
// regular authenticated pilot everywhere else, and there was no existing
// app-level admin concept to reuse (see the pilots.is_admin migration's doc
// comment).

// --- wire types ---

type mergeRequestDTO struct {
	LoserId    string `json:"loserId"`
	SurvivorId string `json:"survivorId"`
}

type mergeManufacturersResponseDTO struct {
	ModelsRepointed int `json:"modelsRepointed"`
}

type mergeModelsResponseDTO struct {
	AircraftRepointed int `json:"aircraftRepointed"`
	ReportsRepointed  int `json:"reportsRepointed"`
}

// requireAdminPilot mirrors findPilotForUser but additionally checks
// pilots.is_admin. Every admin handler calls this first, the same way the
// currency/eligibility handlers start with findPilotForUser.
func requireAdminPilot(app core.App, e *core.RequestEvent) (*core.Record, error) {
	pilot, err := findPilotForUser(app, e.Auth.Id)
	if err != nil {
		return nil, e.ForbiddenError("admin access required", err)
	}
	if !pilot.GetBool("is_admin") {
		return nil, e.ForbiddenError("admin access required", nil)
	}
	return pilot, nil
}

func parseMergeRequest(e *core.RequestEvent) (mergeRequestDTO, error) {
	var body mergeRequestDTO
	if err := e.BindBody(&body); err != nil {
		return body, e.BadRequestError("invalid request body", err)
	}
	if body.LoserId == "" || body.SurvivorId == "" {
		return body, e.BadRequestError("loserId and survivorId are required", nil)
	}
	if body.LoserId == body.SurvivorId {
		return body, e.BadRequestError("loserId and survivorId must differ", nil)
	}
	return body, nil
}

// mergeManufacturersHandler repoints every aircraft_models row on the
// losing manufacturer to the survivor, then deletes the loser. Unlike a
// model merge this never touches `aircraft` or flights' frozen `logged_*`
// snapshots — those reference aircraft_models, not manufacturers directly —
// and `manufacturer` isn't one of modelTypeFieldsChanged's fields (see
// hooks/aircraft_notifications.go), so it doesn't trigger the
// reclassification-drift email either.
func mergeManufacturersHandler(e *core.RequestEvent) error {
	if _, err := requireAdminPilot(e.App, e); err != nil {
		return err
	}

	body, err := parseMergeRequest(e)
	if err != nil {
		return err
	}

	loser, err := e.App.FindRecordById("manufacturers", body.LoserId)
	if err != nil {
		return e.NotFoundError("losing manufacturer not found", err)
	}
	if _, err := e.App.FindRecordById("manufacturers", body.SurvivorId); err != nil {
		return e.NotFoundError("surviving manufacturer not found", err)
	}

	repointed := 0
	txErr := e.App.RunInTransaction(func(txApp core.App) error {
		models, err := txApp.FindRecordsByFilter(
			"aircraft_models", "manufacturer = {:id}", "", 0, 0,
			dbx.Params{"id": loser.Id},
		)
		if err != nil {
			return err
		}
		for _, model := range models {
			model.Set("manufacturer", body.SurvivorId)
			if err := txApp.Save(model); err != nil {
				return err
			}
			repointed++
		}
		return txApp.Delete(loser)
	})
	if txErr != nil {
		// Most likely cause: repointing collided with the (manufacturer,
		// model) unique index because the survivor already had a model row
		// with the same `model` text as one of the loser's — that nested
		// duplicate needs its own model merge first, so this surfaces as a
		// plain 400 rather than trying to resolve it automatically.
		return e.BadRequestError("could not merge manufacturers", txErr)
	}

	return e.JSON(http.StatusOK, mergeManufacturersResponseDTO{ModelsRepointed: repointed})
}

// mergeModelsHandler repoints every `aircraft` row (and any
// `aircraft_model_reports`) on the losing model to the survivor, then
// deletes the loser. Aircraft are repointed via normal record saves rather
// than raw SQL specifically so hooks/aircraft_notifications.go's
// OnRecordAfterUpdateSuccess("aircraft") hook fires as usual — a merge is a
// real reclassification for any pilot whose flights snapshot the losing
// model's now-gone data, same as if an admin had corrected the tail's model
// by hand. `flights.logged_*` snapshot fields (issue #71) are frozen at log
// time and deliberately left untouched — see
// buildFlightAircraftSnapshotFields's doc comment in
// apps/web/src/lib/server/models.ts.
func mergeModelsHandler(e *core.RequestEvent) error {
	if _, err := requireAdminPilot(e.App, e); err != nil {
		return err
	}

	body, err := parseMergeRequest(e)
	if err != nil {
		return err
	}

	loser, err := e.App.FindRecordById("aircraft_models", body.LoserId)
	if err != nil {
		return e.NotFoundError("losing model not found", err)
	}
	if _, err := e.App.FindRecordById("aircraft_models", body.SurvivorId); err != nil {
		return e.NotFoundError("surviving model not found", err)
	}

	aircraftRepointed := 0
	reportsRepointed := 0
	txErr := e.App.RunInTransaction(func(txApp core.App) error {
		aircraft, err := txApp.FindRecordsByFilter(
			"aircraft", "model = {:id}", "", 0, 0,
			dbx.Params{"id": loser.Id},
		)
		if err != nil {
			return err
		}
		for _, a := range aircraft {
			a.Set("model", body.SurvivorId)
			if err := txApp.Save(a); err != nil {
				return err
			}
			aircraftRepointed++
		}

		// Repointed rather than auto-resolved: a report against the loser
		// (e.g. "wrong category/class") may still describe the survivor
		// after the merge, so it stays in the open queue for a human to
		// triage against the surviving row instead of silently closing.
		reports, err := txApp.FindRecordsByFilter(
			"aircraft_model_reports", "model = {:id}", "", 0, 0,
			dbx.Params{"id": loser.Id},
		)
		if err != nil {
			return err
		}
		for _, r := range reports {
			r.Set("model", body.SurvivorId)
			if err := txApp.Save(r); err != nil {
				return err
			}
			reportsRepointed++
		}

		return txApp.Delete(loser)
	})
	if txErr != nil {
		return e.BadRequestError("could not merge models", txErr)
	}

	return e.JSON(http.StatusOK, mergeModelsResponseDTO{
		AircraftRepointed: aircraftRepointed,
		ReportsRepointed:  reportsRepointed,
	})
}
