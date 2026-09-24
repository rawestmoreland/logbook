package web

import (
	"fmt"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func dashboardHandler(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Not authenticated", nil)
	}

	pilot, err := getPilotRecordForUser(e, e.Auth)
	if err != nil {
		return e.String(http.StatusNotFound, "no pilot profile found for this account")
	}

	result, err := paginateRecords(e, "flights", dbx.HashExp{"pilot": pilot.Id})
	if err != nil {
		return e.BadRequestError("", err)
	}

	if err := apis.EnrichRecords(e, result.Items, "aircraft"); err != nil {
		return e.InternalServerError("Failed to expand records", err)
	}

	totalTime := 0.0
	for _, v := range result.Items {
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