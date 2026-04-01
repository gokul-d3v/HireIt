package controllers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"hireit-backend/services"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UserController struct {
	userService services.UserService
}

func NewUserController(us services.UserService) *UserController {
	return &UserController{userService: us}
}

func (ctrl *UserController) ListUsers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	users, err := ctrl.userService.ListUsers(ctx, limit, skip)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}

	c.JSON(http.StatusOK, users)
}

func (ctrl *UserController) Heartbeat(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := ctrl.userService.Heartbeat(ctx, userID.(primitive.ObjectID).Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update heartbeat"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (ctrl *UserController) GetActiveCount(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	count, err := ctrl.userService.GetActiveUserCount(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch active count"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"active_users": count})
}
