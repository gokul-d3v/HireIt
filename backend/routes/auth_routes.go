package routes

import (
	"broassess-backend/controllers"

	"github.com/gin-gonic/gin"
)

func AuthRoutes(r *gin.Engine) {
	r.POST("/signup", controllers.Signup)
	r.POST("/login", controllers.Login)
	r.GET("/auth/google", controllers.AuthGoogle)
	r.GET("/auth/google/callback", controllers.AuthGoogleCallback)
	r.GET("/auth/google/login", controllers.GoogleLogin)
	r.GET("/auth/google/login/callback", controllers.GoogleLoginCallback)
}
