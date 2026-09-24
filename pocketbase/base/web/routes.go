package web

import (
	"github.com/pocketbase/pocketbase/core"
)

func RegisterRoutes(app core.App, se *core.ServeEvent) {
	// Auth routes
	se.Router.GET("/signup", signupPageHandler)
	se.Router.POST("/signup", signupSubmitHandler)
	se.Router.GET("/verify-pending", requireAuth(verifyPendingPageHandler))
	se.Router.GET("/verify-status", requireAuth(verificationStatusHandler))
	se.Router.GET("/login", loginPageHandler)
	se.Router.POST("/login", loginSubmitHandler)
	se.Router.POST("/logout", logoutHandler)

	// Dashboard Routes
	se.Router.GET("/dashboard", requireAuth(dashboardHandler))

	// Flight routes
	se.Router.GET("/flight/{id}", requireAuth(flightDetailHandler))
	se.Router.GET("/flights/new", requireAuth(newFlightPageHandler))
	se.Router.POST("/flights/new", requireAuth(newFlightSubmitHandler))
	se.Router.DELETE("/flights/{id}", requireAuth(flightDeleteSubmitHandler))

	// Aircraft routes
	se.Router.GET("/aircraft", requireAuth(aircraftPageHandler))
	se.Router.GET("/aircraft/{id}", requireAuth(aircraftDetailPageHandler))

	// User management routes
	se.Router.GET("/profile", requireAuth(profilePageHandler))
	se.Router.PATCH("/profile/{id}", requireAuth(profilePatchHandler))
}