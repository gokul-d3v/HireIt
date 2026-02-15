package routes

import (
	"broassess-backend/controllers"

	"github.com/gin-gonic/gin"
)

func InterviewerRoutes(r *gin.RouterGroup) {
	// Interviewer specific routes
	r.POST("/assessments", controllers.CreateAssessment)
	r.PUT("/assessments/:id", controllers.UpdateAssessment)
	r.DELETE("/assessments/:id", controllers.DeleteAssessment)
	r.GET("/assessments/my", controllers.GetMyAssessments)
	r.GET("/assessments/:id/submissions", controllers.GetSubmissions)

	// Interview Management
	r.POST("/interviews/slots", controllers.CreateInterviewSlot)
	r.GET("/interviews/my", controllers.GetMyInterviews)
	r.PUT("/interviews/:id", controllers.UpdateInterview)
	r.DELETE("/interviews/:id", controllers.CancelInterview)
	r.POST("/interviews/:id/complete", controllers.CompleteInterview)
}
