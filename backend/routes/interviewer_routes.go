package routes

import (
	"hireit-backend/controllers"

	"github.com/gin-gonic/gin"
)

func InterviewerRoutes(r *gin.RouterGroup, assessCtrl *controllers.AssessmentController, interviewCtrl *controllers.InterviewController) {
	assessments := r.Group("/assessments")
	{
		assessments.POST("/", assessCtrl.CreateAssessment)
		assessments.GET("/", assessCtrl.GetAssessments)
		assessments.GET("/:id", assessCtrl.GetAssessmentByID)
		assessments.PUT("/:id", assessCtrl.UpdateAssessment)
		assessments.DELETE("/:id", assessCtrl.DeleteAssessment)
		assessments.GET("/:id/submissions", assessCtrl.GetSubmissions)
	}

	// Interview Management
	interviews := r.Group("/interviews")
	{
		interviews.POST("/slots", interviewCtrl.CreateInterviewSlot)
		interviews.GET("/my", interviewCtrl.GetMyInterviews)
		interviews.PUT("/:id", interviewCtrl.UpdateInterview)
		interviews.DELETE("/slots/:id", interviewCtrl.DeleteInterviewSlot)
	}
}
