package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func AssessmentRoutes(r *gin.RouterGroup, assessCtrl *controllers.AssessmentController) {
	assessments := r.Group("/assessments")
	{
		// --- Shared Routes (any authenticated user) ---
		assessments.GET("", assessCtrl.GetAssessments)
		assessments.GET("/my", assessCtrl.GetAssessments)          // Interviewers: their assessments; handled by service via role
		assessments.GET("/submissions/my", assessCtrl.GetMySubmissions) // Candidates: their submission history
		assessments.GET("/:id", assessCtrl.GetAssessmentByID)

		// --- Interviewer Only Routes (write operations + management) ---
		interviewer := assessments.Group("")
		interviewer.Use(middleware.RoleMiddleware("interviewer", "admin"))
		{
			interviewer.GET("/interviewer/logs", assessCtrl.GetSubmissionsByInterviewer)
			interviewer.GET("/:id/pin", assessCtrl.GetCurrentPIN)           // Live 4-digit rotating PIN
			interviewer.GET("/:id/submissions", assessCtrl.GetSubmissions)
			interviewer.POST("", assessCtrl.CreateAssessment)
			interviewer.POST("/preview", assessCtrl.PreviewQuestions)
			interviewer.POST("/:id/regenerate-password", assessCtrl.RegeneratePassword)
			interviewer.PUT("/:id", assessCtrl.UpdateAssessment)
			interviewer.DELETE("/:id", assessCtrl.DeleteAssessment)
		}

		// --- Candidate Only Routes (exam participation) ---
		candidate := assessments.Group("")
		candidate.Use(middleware.RoleMiddleware("candidate", "user"))
		{
			candidate.POST("/:id/submit", assessCtrl.SubmitAssessment)
			candidate.POST("/:id/progress", assessCtrl.SaveAssessmentProgress)
			candidate.GET("/:id/result", assessCtrl.GetCandidateResult)
		}
	}
}
