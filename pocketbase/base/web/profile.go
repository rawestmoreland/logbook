package web

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

func profilePageHandler(e *core.RequestEvent) error {
	user := e.Get("authRecord").(*core.Record)
	pilot, err := getPilotRecordForUser(e, user)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	return renderPage(e.Response, "user-profile", map[string]any{
		"User":  user,
		"Pilot": pilot,
	})
}

func profilePatchHandler(e *core.RequestEvent) error {
	name := e.Request.FormValue("name")
	isInstructor := e.Request.FormValue("is_instructor")
	cfiNumber := e.Request.FormValue("cfi_certificate_number")

	id := e.Request.PathValue("id")

	pilotRecord, err := e.App.FindRecordById("pilots", id)
	if err != nil {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "No pilot exists with this id",
		})
	}

	pilotRecord.Set("name", name)
	pilotRecord.Set("is_instructor", isInstructor == "on" || isInstructor == "true")
	pilotRecord.Set("cfi_certificate_number", cfiNumber)

	if err := e.App.Save(pilotRecord); err != nil {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Could not update pilot record",
		})
	}

	e.Response.Header().Set("HX-Redirect", "/profile")
	return nil
}