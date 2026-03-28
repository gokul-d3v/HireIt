package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func AuthRoutes(r *gin.Engine, authCtrl *controllers.AuthController, googleCtrl *controllers.GoogleAuthController) {
	api := r.Group("/api")
	{
		api.POST("/signup", authCtrl.Signup)
		api.POST("/login", authCtrl.Login)
		api.GET("/auth/google/login", googleCtrl.GoogleLogin)
		api.GET("/auth/google/login/callback", googleCtrl.GoogleLoginCallback)

		// Protected route to set password
		api.POST("/auth/set-password", middleware.AuthMiddleware(), authCtrl.SetPassword)
	}
}
