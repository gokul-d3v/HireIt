package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine,
	authCtrl *controllers.AuthController,
	googleCtrl *controllers.GoogleAuthController,
	publicCtrl *controllers.PublicController,
	assessCtrl *controllers.AssessmentController,
	interviewCtrl *controllers.InterviewController,
) {
	// Public Routes
	AuthRoutes(r, authCtrl, googleCtrl)
	SetupPublicRoutes(r, publicCtrl)

	// Protected Routes
	protected := r.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	{
		UserRoutes(protected)
		InterviewerRoutes(protected, assessCtrl, interviewCtrl)
		CandidateRoutes(protected, assessCtrl, interviewCtrl)
	}
}
