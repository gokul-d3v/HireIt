package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine,
	authCtrl *controllers.AuthController,
	googleCtrl *controllers.GoogleAuthController,
	youtubeCtrl *controllers.YouTubeController,
	publicCtrl *controllers.PublicController,
	assessCtrl *controllers.AssessmentController,
	interviewCtrl *controllers.InterviewController,
	userCtrl *controllers.UserController,
) {
	// Public Routes
	AuthRoutes(r, authCtrl, googleCtrl)
	YouTubeRoutes(r, youtubeCtrl)
	SetupPublicRoutes(r, publicCtrl)

	// Protected Routes
	protected := r.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	{
		UserRoutes(protected, userCtrl)
		AssessmentRoutes(protected, assessCtrl)
		InterviewRoutes(protected, interviewCtrl)

		// YouTube Evidence Route
		protected.POST("/assessments/:id/upload-evidence", youtubeCtrl.UploadEvidence)
	}
}
