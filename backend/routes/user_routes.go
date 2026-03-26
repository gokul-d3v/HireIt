package routes

import (
	"hireit-backend/controllers"
	"hireit-backend/middleware"

	"github.com/gin-gonic/gin"
)

func UserRoutes(r *gin.RouterGroup, ctrl *controllers.UserController) {
	// Heartbeat for anyone authenticated
	r.POST("/users/heartbeat", ctrl.Heartbeat)

	// Admin/Interviewer only
	admin := r.Group("/admin")
	admin.Use(middleware.RoleMiddleware("interviewer", "admin"))
	{
		admin.GET("/users", ctrl.ListUsers)
		admin.PATCH("/users/:id/status", ctrl.ToggleStatus)
		admin.GET("/users/active-count", ctrl.GetActiveCount)
	}
}
