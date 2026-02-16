package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func AuthRoutes(r *gin.Engine) {
	r.POST("/signup", controllers.Signup)
	r.POST("/login", controllers.Login)
	r.GET("/auth/google/login", controllers.GoogleLogin)
	r.GET("/auth/google/login/callback", controllers.GoogleLoginCallback)

	// Protected route to set password
	r.POST("/auth/set-password", middleware.AuthMiddleware(), controllers.SetPassword)
}
