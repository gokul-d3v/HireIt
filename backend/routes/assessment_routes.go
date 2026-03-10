package routes

import (
	"hireit-backend/controllers"

	"github.com/gin-gonic/gin"
)

func AssessmentRoutes(r *gin.RouterGroup, assessCtrl *controllers.AssessmentController) {
	assessments := r.Group("/assessments")
	{
		// Static Routes First
		assessments.GET("", assessCtrl.GetAssessments)
		assessments.GET("/my", assessCtrl.GetAssessments) // Map /my to GetAssessments for now
		assessments.GET("/submissions/my", assessCtrl.GetMySubmissions)
		assessments.POST("", assessCtrl.CreateAssessment)

		// Parametric Routes
		assessments.GET("/:id", assessCtrl.GetAssessmentByID)
		assessments.POST("/:id/submit", assessCtrl.SubmitAssessment)
		assessments.POST("/:id/progress", assessCtrl.SaveAssessmentProgress)
		assessments.GET("/:id/result", assessCtrl.GetCandidateResult)
		assessments.PUT("/:id", assessCtrl.UpdateAssessment)
		assessments.DELETE("/:id", assessCtrl.DeleteAssessment)
		assessments.GET("/:id/submissions", assessCtrl.GetSubmissions)
	}
}
