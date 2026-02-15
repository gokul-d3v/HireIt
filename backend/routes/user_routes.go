package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func UserRoutes(r *gin.RouterGroup) {
	r.GET("/dashboard", func(c *gin.Context) {
		role, _ := c.Get("role")
		c.JSON(http.StatusOK, gin.H{
			"message": "Welcome to the dashboard",
			"role":    role,
		})
	})
}
