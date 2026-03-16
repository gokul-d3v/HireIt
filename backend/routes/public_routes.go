package routes

import (
	"hireit-backend/controllers"

	"github.com/gin-gonic/gin"
)

func SetupPublicRoutes(router *gin.Engine, publicCtrl *controllers.PublicController) {
	public := router.Group("/api/public")
	{
		public.POST("/start", publicCtrl.StartPublicAssessment)
		public.POST("/demo", publicCtrl.StartDemoAssessment)
		public.POST("/start-otp", publicCtrl.StartAssessmentOTP)
	}
}
