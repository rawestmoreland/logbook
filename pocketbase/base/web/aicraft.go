package web

import (
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func aircraftPageHandler(e *core.RequestEvent) error {
	user := e.Get("authRecord").(*core.Record)
	pilot, err := getPilotRecordForUser(e, user)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	aircraft, err := e.App.FindRecordsByFilter("pilot_aircraft", "pilot = {:pid}", "-created", 50, 0, dbx.Params{"pid": pilot.Id})
	if err != nil {
		return e.String(http.StatusInternalServerError, "could not load aircraft")
	}

	_ = e.App.ExpandRecords(aircraft, []string{"aircraft"}, nil)

	return renderPage(e.Response, "aircraft", map[string]any{
		"Title":    "Your aircraft",
		"User":     user,
		"Aircraft": aircraft,
	})
}

func aircraftDetailPageHandler(e *core.RequestEvent) error {
	user := e.Get("authRecord").(*core.Record)
	id := e.Request.PathValue("id")

	aircraft, err := e.App.FindRecordById("aircraft", id)
	if err != nil {
		return e.String(http.StatusNotFound, "aircraft not found")
	}

	info, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("failed to retrieve request info", err)
	}

	canAccess, err := e.App.CanAccessRecord(aircraft, info, aircraft.Collection().ViewRule)
	if !canAccess {
		return e.ForbiddenError("", err)
	}

	return renderPage(e.Response, "aircraft-detail", map[string]any{
		"Title":    "Aircraft detail",
		"User":     user,
		"Aircraft": aircraft,
	})
}