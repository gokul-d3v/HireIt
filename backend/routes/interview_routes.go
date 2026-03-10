package routes

import (
	"hireit-backend/controllers"

	"github.com/gin-gonic/gin"
)

func InterviewRoutes(r *gin.RouterGroup, interviewCtrl *controllers.InterviewController) {
	interviews := r.Group("/interviews")
	{
		// Shared Routes
		interviews.GET("/my", interviewCtrl.GetMyInterviews)

		// Candidate Routes
		interviews.GET("/available", interviewCtrl.GetAvailableSlots)
		interviews.POST("/:id/book", interviewCtrl.BookInterview)

		// Interviewer Routes
		interviews.POST("/slots", interviewCtrl.CreateInterviewSlot)
		interviews.PUT("/:id", interviewCtrl.UpdateInterview)
		interviews.DELETE("/slots/:id", interviewCtrl.DeleteInterviewSlot)
	}
}
