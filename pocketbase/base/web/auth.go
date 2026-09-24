package web

import (
	"fmt"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

func requireAuth(next func(*core.RequestEvent) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		cookie, err := e.Request.Cookie("pb_auth")
		if err != nil {
			return redirectToLogin(e)
		}

		record, err := e.App.FindAuthRecordByToken(cookie.Value, core.TokenTypeAuth)
		if err != nil {
			return redirectToLogin(e)
		}

		e.Auth = record
		e.Set("authRecord", record)
		return next(e)
	}
}

func redirectToLogin(e *core.RequestEvent) error {
	if e.Request.Header.Get("HX-Request") == "true" {
		e.Response.Header().Set("HX-Redirect", "/login")
		return e.String(http.StatusUnauthorized, "")
	}
	return e.Redirect(http.StatusSeeOther, "/login")
}

func loginPageHandler(e *core.RequestEvent) error {
	return renderPage(e.Response, "login", map[string]any{
		"Title": "Login",
	})
}

func loginSubmitHandler(e *core.RequestEvent) error {
	email := e.Request.FormValue("email")
	password := e.Request.FormValue("password")

	record, err := e.App.FindAuthRecordByEmail("users", email)
	if err != nil || !record.ValidatePassword(password) {
		return renderFragment(e.Response, "login-error", map[string]any{
			"Error": "Invalid email or password",
		})
	}

	token, err := record.NewAuthToken()
	if err != nil {
		return e.String(http.StatusInternalServerError, "could not create a session")
	}

	e.SetCookie(&http.Cookie{
		Name:     "pb_auth",
		Value:    token,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})

	e.Response.Header().Set("HX-Redirect", "/dashboard")
	return nil
}

func logoutHandler(e *core.RequestEvent) error {
	http.SetCookie(e.Response, &http.Cookie{
		Name:     "pb_auth",
		Value:    "",
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1, // tells the browser to delete the cookie immediately
	})

	e.Response.Header().Set("HX-Redirect", "/login")
	return nil
}

func getPilotRecordForUser(e *core.RequestEvent, user *core.Record) (*core.Record, error) {
	pilot, err := e.App.FindFirstRecordByData("pilots", "user", user.Id)
	if err != nil {
		// Return the zero value ("") and a standard error object
		return nil, fmt.Errorf("no pilot profile found for this account: %w", err)
	}

	return pilot, nil
}
