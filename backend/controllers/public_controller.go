package controllers

import (
	"context"
	"net/http"
	"time"

	"hireit-backend/services"

	"github.com/gin-gonic/gin"
)

type PublicController struct {
	authService services.AuthService
}

func NewPublicController(authService services.AuthService) *PublicController {
	return &PublicController{authService: authService}
}

// StartPublicAssessment handles guest login/signup for taking a test
func (ctrl *PublicController) StartPublicAssessment(c *gin.Context) {
	var input struct {
		Name         string `json:"name" binding:"required"`
		Email        string `json:"email" binding:"required,email"`
		Phone        string `json:"phone"`
		AssessmentID string `json:"assessment_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	token, user, err := ctrl.authService.StartPublicAssessment(ctx, input.Name, input.Email, input.Phone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initiate assessment session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}
