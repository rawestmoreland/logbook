package web

import (
	"fmt"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/search"
)

func RegisterRoutes(app core.App, se *core.ServeEvent) {
	se.Router.GET("/login", loginPageHandler)
	se.Router.POST("/login", loginSubmitHandler)
	se.Router.POST("/logout", logoutHandler)
	se.Router.GET("/dashboard", requireAuth(dashboardHandler))
	se.Router.GET("/flights", requireAuth(flightsPageHandler))
	se.Router.GET("/flight/{id}", requireAuth(flightDetailHandler))
	se.Router.GET("/flights/new", requireAuth(newFlightPageHandler))
	se.Router.POST("/flights/new", requireAuth(newFlightSubmitHandler))
	se.Router.DELETE("/flights/{id}", requireAuth(flightDeleteSubmitHandler))
	se.Router.GET("/aircraft", requireAuth(aircraftPageHandler))
	se.Router.GET("/aircraft/{id}", requireAuth(aircraftDetailPageHandler))
	se.Router.GET("/profile", requireAuth(profilePageHandler))
}

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

func dashboardHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Not authenticated", nil)
	}

	requestInfo, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("", err)
	}

	pilot, err := getPilotRecordForUser(e, e.Auth)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	collection, err := e.App.FindCollectionByNameOrId("flights")
	if err != nil {
		return e.NotFoundError("", err)
	}

	records := []*core.Record{}

	query := e.App.RecordQuery(collection).AndWhere(dbx.HashExp{"pilot": pilot.Id})

	fieldResolver := core.NewRecordFieldResolver(e.App, collection, requestInfo, true)

	result, err := search.NewProvider(fieldResolver).
		Query(query).
		ParseAndExec(e.Request.URL.Query().Encode(), &records)
	if err != nil {
		return e.BadRequestError("", err)
	}

	if err := apis.EnrichRecords(e, records, "aircraft"); err != nil {
		return e.InternalServerError("Failed to expand records", err)
	}

	// swap in the actual records so they serialize with expand/etc.
	result.Items = records

	totalTime := 0.0

	for _, v := range records {
		totalTime += v.GetFloat("total_time")
	}

	return renderPage(e.Response, "dashboard", map[string]any{
		"User":         e.Auth,
		"Flights":      result.Items,
		"TotalTime":    fmt.Sprintf("%.1f", totalTime),
		"TotalPages":   result.TotalPages,
		"TotalFlights": result.TotalItems,
		"Page":         result.Page,
		"PerPage":      result.PerPage,
		"HasPrev":      result.Page > 1,
		"HasNext":      result.Page < result.TotalPages,
		"PrevPage":     result.Page - 1,
		"NextPage":     result.Page + 1,
	})
}

func flightDetailHandler(e *core.RequestEvent) error {
	user := e.Get("authRecord").(*core.Record)
	id := e.Request.PathValue("id")

	flight, err := e.App.FindRecordById("flights", id)
	if err != nil {
		return e.String(http.StatusNotFound, "flight not found")
	}

	errs := e.App.ExpandRecord(flight, []string{"aircraft"}, nil)
	if len(errs) > 0 {
		return e.String(http.StatusNotFound, "aircraft not found")
	}

	info, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("failed to retrieve request info", err)
	}

	canAccess, err := e.App.CanAccessRecord(flight, info, flight.Collection().ViewRule)
	if !canAccess {
		return e.ForbiddenError("", err)
	}

	return renderPage(e.Response, "flight-detail", map[string]any{
		"Title":    "Flight Detail",
		"User":     user,
		"Flight":   flight,
		"Aircraft": flight.ExpandedOne("aircraft"),
	})
}

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

func newFlightPageHandler(e *core.RequestEvent) error {
	user := e.Get("authRecord").(*core.Record)
	pilot, err := getPilotRecordForUser(e, user)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	aircraft, _ := e.App.FindAllRecords("pilot_aircraft", dbx.NewExp("pilot = {:pid}", dbx.Params{"pid": pilot.Id}))

	e.App.ExpandRecords(aircraft, []string{"aircraft", "aircraft.model"}, nil)

	return renderPage(e.Response, "add-flight", map[string]any{
		"Title":    "Add a flight",
		"User":     user,
		"Aircraft": aircraft,
	})
}

func newFlightSubmitHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Not authenticated", nil)
	}

	pilot, err := getPilotRecordForUser(e, e.Auth)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	date := e.Request.FormValue("date")
	aircraft := e.Request.FormValue("aircraft")
	route_from := e.Request.FormValue("route_from")
	route_to := e.Request.FormValue("route_to")
	holding := e.Request.FormValue("holding")
	total_time := e.Request.FormValue("total_time")
	course_tracking := e.Request.FormValue("course_tracking")

	collection, err := e.App.FindCollectionByNameOrId("flights")
	if err != nil {
		return err
	}

	loggedAircraft, err := e.App.FindRecordById("aircraft", aircraft)
	if err != nil {
		return err
	}

	errs := e.App.ExpandRecord(loggedAircraft, []string{"model"}, nil)
	if len(errs) > 0 {
		return fmt.Errorf("failed to expand: %v", errs)
	}

	modelData := loggedAircraft.ExpandedOne("model")

	record := core.NewRecord(collection)
	record.Set("pilot", pilot.Id)
	record.Set("date", date)
	record.Set("aircraft", aircraft)
	record.Set("route_from", route_from)
	record.Set("route_to", route_to)
	record.Set("holding", holding == "on" || holding == "true")
	record.Set("course_tracking", course_tracking == "on" || course_tracking == "true")
	record.Set("total_time", total_time)
	record.Set("logged_category_class", modelData.GetString("category_class"))
	record.Set("logged_aircraft_type", modelData.GetString("common_name"))

	err = e.App.Save(record)

	if err != nil {
		return renderFragment(e.Response, "new-flight-error", map[string]any{
			"Error": "Could not add the flight",
		})
	}

	e.Response.Header().Set("HX-Redirect", "/dashboard")
	return nil
}

func flightDeleteSubmitHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Not authenticated", nil)
	}

	id := e.Request.PathValue("id")

	flight, err := e.App.FindRecordById("flights", id)
	if err != nil {
		return renderFragment(e.Response, "flight-delete-error", map[string]any{
			"Error": "The flight record couldn't be found.",
		})
	}

	info, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("failed to retrieve request info", err)
	}

	canAccess, err := e.App.CanAccessRecord(flight, info, flight.Collection().DeleteRule)
	if !canAccess {
		return renderFragment(e.Response, "flight-delete-error", map[string]any{
			"Error": "You don't have permission to delete this flight.",
		})
	}

	if err := e.App.Delete(flight); err != nil {
		return renderFragment(e.Response, "flight-delete-error", map[string]any{
			"Error": "We couldn't delete this record",
		})
	}

	return e.NoContent(http.StatusOK)
}

func flightsPageHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Not authenticated", nil)
	}

	requestInfo, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("", err)
	}

	pilot, err := getPilotRecordForUser(e, e.Auth)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	collection, err := e.App.FindCollectionByNameOrId("flights")
	if err != nil {
		return e.NotFoundError("", err)
	}

	records := []*core.Record{}

	query := e.App.RecordQuery(collection).AndWhere(dbx.HashExp{"pilot": pilot.Id})

	fieldResolver := core.NewRecordFieldResolver(e.App, collection, requestInfo, true)

	result, err := search.NewProvider(fieldResolver).
		Query(query).
		ParseAndExec(e.Request.URL.Query().Encode(), &records)
	if err != nil {
		return e.BadRequestError("", err)
	}

	// swap in the actual records so they serialize with expand/etc.
	result.Items = records
	return renderPage(e.Response, "flights", map[string]any{
		"Flights":    result.Items,
		"TotalPages": result.TotalPages,
		"TotalItems": result.TotalItems,
		"Page":       result.Page,
		"PerPage":    result.PerPage,
	})
}
