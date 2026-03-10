package routes

import (
	"hireit-backend/controllers"

	"github.com/gin-gonic/gin"
)

func CandidateRoutes(r *gin.RouterGroup, assessCtrl *controllers.AssessmentController, interviewCtrl *controllers.InterviewController) {
	assessments := r.Group("/assessments")
	{
		assessments.GET("/", assessCtrl.GetAssessments)
		assessments.GET("/:id", assessCtrl.GetAssessmentByID)
		assessments.POST("/:id/submit", assessCtrl.SubmitAssessment)
		assessments.POST("/:id/progress", assessCtrl.SaveAssessmentProgress)
		assessments.GET("/:id/result", assessCtrl.GetCandidateResult)
		assessments.GET("/submissions/my", assessCtrl.GetMySubmissions)
	}
	// Interview Booking
	interviews := r.Group("/interviews")
	{
		interviews.GET("/available", interviewCtrl.GetAvailableSlots)
		interviews.POST("/:id/book", interviewCtrl.BookInterview)
		interviews.GET("/my", interviewCtrl.GetMyInterviews)
	}
	// Note: CancelInterview is in InterviewerRoutes
	// They handle both roles internally based on user role
}
