package routes

import (
	"broassess-backend/controllers"

	"github.com/gin-gonic/gin"
)

func CandidateRoutes(r *gin.RouterGroup) {
	// Candidate specific routes
	r.GET("/assessments", controllers.GetAssessments)
	r.GET("/assessments/:id", controllers.GetAssessmentByID)

	r.POST("/assessments/:id/submit", controllers.SubmitAssessment)
	r.GET("/assessments/:id/result", controllers.GetCandidateResult)
	r.GET("/submissions/me", controllers.GetMySubmissions)

	// Interview Booking
	r.GET("/interviews/available", controllers.GetAvailableSlots)
	r.POST("/interviews/:id/book", controllers.BookInterview)
	// Note: GetMyInterviews and CancelInterview are in InterviewerRoutes
	// They handle both roles internally based on user role
}
