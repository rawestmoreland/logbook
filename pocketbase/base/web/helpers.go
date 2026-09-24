package web

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/search"
)

type paginatedResult struct {
	Items      []*core.Record
	Page       int
	PerPage    int
	TotalItems int
	TotalPages int
}

func paginateRecords(e *core.RequestEvent, collectionName string, filter dbx.HashExp) (*paginatedResult, error) {
	requestInfo, err := e.RequestInfo()
	if err != nil {
		return nil, err
	}

	collection, err := e.App.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return nil, err
	}

	records := []*core.Record{}
	query := e.App.RecordQuery(collection).AndWhere(filter)
	fieldResolver := core.NewRecordFieldResolver(e.App, collection, requestInfo, true)

	result, err := search.NewProvider(fieldResolver).
		Query(query).
		ParseAndExec(e.Request.URL.Query().Encode(), &records)
	if err != nil {
		return nil, err
	}

	return &paginatedResult{
		Items: records, Page: result.Page, PerPage: result.PerPage,
		TotalItems: result.TotalItems, TotalPages: result.TotalPages,
	}, nil
}

func getPilotRecordForUser(e *core.RequestEvent, user *core.Record) (*core.Record, error) {
	pilot, err := e.App.FindFirstRecordByData("pilots", "user", user.Id)
	if err != nil {
		// Return the zero value ("") and a standard error object
		return nil, fmt.Errorf("no pilot profile found for this account: %w", err)
	}

	return pilot, nil
}