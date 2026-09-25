package web

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/mails"
)

func requireAuth(next func(*core.RequestEvent) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		cookie, err := e.Request.Cookie("pb_auth_htmx")
		if err != nil {
			return redirectToLogin(e)
		}

		record, err := e.App.FindAuthRecordByToken(cookie.Value, core.TokenTypeAuth)
		if err != nil {
			return redirectToLogin(e)
		}

		e.Auth = record
		e.Set("authRecord", record)

		if !e.Auth.Verified() && e.Request.URL.Path != "/verify-pending" {
			return redirectToVerify(e)
		}

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

func redirectToVerify(e *core.RequestEvent) error {
	if e.Request.Header.Get("HX-Request") == "true" {
		e.Response.Header().Set("HX-Redirect", "/verify-pending")
		return e.String(http.StatusUnauthorized, "")
	}
	return e.Redirect(http.StatusSeeOther, "/verify-pending")
}

func signupPageHandler(e *core.RequestEvent) error {
	return renderAuthPage(e.Response, "signup", map[string]any{
		"Title": "Sign up",
	})
}

func signupSubmitHandler(e *core.RequestEvent) error {
	email := e.Request.FormValue("email")
	password := e.Request.FormValue("password")
	passwordConfirm := e.Request.FormValue("password-confirm")

	if password != passwordConfirm {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Passwords must match",
		})
	}

	usersCollection, err := e.App.FindCollectionByNameOrId("users")
	if err != nil {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Signup is temporarily unavailable",
		})
	}
	pilotsCollection, err := e.App.FindCollectionByNameOrId("pilots")
	if err != nil {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Signup is temporarily unavailable",
		})
	}

	newUser := core.NewRecord(usersCollection)

	newUser.SetEmail(email)
	newUser.SetPassword(password)

	err = e.App.Save(newUser)
	if err != nil {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Could not complete signup",
		})
	}

	// Create the pilot record
	newPilot := core.NewRecord(pilotsCollection)

	newPilot.Set("user", newUser.Id)

	err = e.App.Save(newPilot)
	if err != nil {
		// We should show an error and also roll-back the user creation
		e.App.Delete(newUser)
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Could not complete signup",
		})
	}

	if err := mails.SendRecordVerification(e.App, newUser); err != nil {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Could not send verification email",
		})
	}

	token, err := newUser.NewAuthToken()
	if err != nil {
		return e.String(http.StatusInternalServerError, "could not create a session")
	}

	e.SetCookie(&http.Cookie{
		Name:     "pb_auth_htmx",
		Value:    token,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})

	e.Response.Header().Set("HX-Redirect", "/verify-pending")
	return nil

}

func verifyPendingPageHandler(e *core.RequestEvent) error {
	return renderAuthPage(e.Response, "verify-pending", map[string]any{
		"Title": "Success!",
	})
}

func loginPageHandler(e *core.RequestEvent) error {
	return renderAuthPage(e.Response, "login", map[string]any{
		"Title": "Login",
	})
}

func loginSubmitHandler(e *core.RequestEvent) error {
	email := e.Request.FormValue("email")
	password := e.Request.FormValue("password")

	record, err := e.App.FindAuthRecordByEmail("users", email)
	if err != nil || !record.ValidatePassword(password) {
		return renderFragment(e.Response, "form-error", map[string]any{
			"Error": "Invalid email or password",
		})
	}

	token, err := record.NewAuthToken()
	if err != nil {
		return e.String(http.StatusInternalServerError, "could not create a session")
	}

	e.SetCookie(&http.Cookie{
		Name:     "pb_auth_htmx",
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
		Name:     "pb_auth_htmx",
		Value:    "",
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1, // tells the browser to delete the cookie immediately
	})

	e.Response.Header().Set("HX-Redirect", "/login")
	return nil
}

func verificationStatusHandler(e *core.RequestEvent) error {
	userRecord := e.Auth

	if userRecord.Verified() {
		e.Response.Header().Set("HX-Redirect", "/dashboard")
	}
	return nil
}
