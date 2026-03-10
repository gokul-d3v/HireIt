package routes

import (
	"hireit-backend/controllers"

	"github.com/gin-gonic/gin"
)

func YouTubeRoutes(r *gin.Engine, ctrl *controllers.YouTubeController) {
	youtube := r.Group("/api/youtube")
	{
		youtube.GET("/auth", ctrl.AuthYouTube)
		youtube.GET("/callback", ctrl.AuthYouTubeCallback)
	}
}
