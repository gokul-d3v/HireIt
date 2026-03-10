package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func AuthRoutes(r *gin.Engine, authCtrl *controllers.AuthController, googleCtrl *controllers.GoogleAuthController) {
	r.POST("/signup", authCtrl.Signup)
	r.POST("/login", authCtrl.Login)
	r.GET("/auth/google/login", googleCtrl.GoogleLogin)
	r.GET("/auth/google/login/callback", googleCtrl.GoogleLoginCallback)

	// Protected route to set password
	r.POST("/auth/set-password", middleware.AuthMiddleware(), authCtrl.SetPassword)
}
