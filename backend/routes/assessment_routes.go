package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func AssessmentRoutes(r *gin.RouterGroup, assessCtrl *controllers.AssessmentController) {
	assessments := r.Group("/assessments")
	{
		// --- Shared / Context-Aware Routes ---
		assessments.GET("", assessCtrl.GetAssessments)
		assessments.GET("/:id", assessCtrl.GetAssessmentByID)

		// --- Interviewer Only Routes ---
		interviewer := assessments.Group("")
		interviewer.Use(middleware.RoleMiddleware("interviewer", "admin"))
		{
			interviewer.GET("/interviewer/logs", assessCtrl.GetSubmissionsByInterviewer)
			interviewer.POST("", assessCtrl.CreateAssessment)
			interviewer.POST("/preview", assessCtrl.PreviewQuestions)
			interviewer.PUT("/:id", assessCtrl.UpdateAssessment)
			interviewer.DELETE("/:id", assessCtrl.DeleteAssessment)
			interviewer.GET("/:id/submissions", assessCtrl.GetSubmissions)
			interviewer.POST("/:id/regenerate-password", assessCtrl.RegeneratePassword)
		}

		// --- Candidate Only Routes ---
		candidate := assessments.Group("")
		candidate.Use(middleware.RoleMiddleware("candidate", "user"))
		{
			candidate.GET("/my", assessCtrl.GetMySubmissions)
			candidate.GET("/submissions/my", assessCtrl.GetMySubmissions)
			candidate.POST("/:id/submit", assessCtrl.SubmitAssessment)
			candidate.POST("/:id/progress", assessCtrl.SaveAssessmentProgress)
			candidate.GET("/:id/result", assessCtrl.GetCandidateResult)
		}
	}
}
