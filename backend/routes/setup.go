package routes

import (
	"broassess-backend/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine) {
	// Public Routes
	AuthRoutes(r)
	SetupPublicRoutes(r)

	// Protected Routes
	protected := r.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	{
		UserRoutes(protected)
		InterviewerRoutes(protected)
		CandidateRoutes(protected)
	}
}
