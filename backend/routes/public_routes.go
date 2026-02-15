package routes

import (
	"broassess-backend/controllers"

	"github.com/gin-gonic/gin"
)

func SetupPublicRoutes(router *gin.Engine) {
	public := router.Group("/api/public")
	{
		public.POST("/start", controllers.StartPublicAssessment)
	}
}
