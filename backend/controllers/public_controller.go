package controllers

import (
	"context"
	"net/http"
	"time"

	"hireit-backend/services"

	"github.com/gin-gonic/gin"
)

type PublicController struct {
	authService   services.AuthService
	assessService services.AssessmentService
}

func NewPublicController(authService services.AuthService, assessService services.AssessmentService) *PublicController {
	return &PublicController{
		authService:   authService,
		assessService: assessService,
	}
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

// StartDemoAssessment handles starting a demo session without registration
func (ctrl *PublicController) StartDemoAssessment(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	token, user, err := ctrl.authService.StartDemoAssessment(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initiate demo session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":      user.ID,
			"name":    user.Name,
			"email":   user.Email,
			"role":    user.Role,
			"is_demo": user.IsDemo,
		},
	})
}
// StartAssessmentOTP handles candidate login using phone number + OTP
func (ctrl *PublicController) StartAssessmentOTP(c *gin.Context) {
	var input struct {
		Phone string `json:"phone" binding:"required"`
		OTP   string `json:"otp" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	token, user, err := ctrl.authService.StartAssessmentWithOTP(ctx, input.Phone, input.OTP)
	if err != nil {
		switch err.Error() {
		case "invalid OTP":
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid OTP. Please try again."})
		case "candidate not found. please check your phone number":
			c.JSON(http.StatusNotFound, gin.H{"error": "Candidate not found. Please check your phone number."})
		case "your access to assessments has been disabled":
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate OTP"})
		}
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

// SendOTP triggers MSG91 to send an OTP to the candidate
func (ctrl *PublicController) SendOTP(c *gin.Context) {
	var input struct {
		Phone string `json:"phone" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := ctrl.authService.SendOTP(ctx, input.Phone); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send OTP: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "OTP sent successfully"})
}

// GetAssessmentMetadata fetches public details about an assessment without requiring authentication
func (ctrl *PublicController) GetAssessmentMetadata(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Use "public" role to indicate this is an unauthenticated request
	assessment, err := ctrl.assessService.GetAssessmentByID(ctx, id, "public")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          assessment.ID.Hex(),
		"title":       assessment.Title,
		"duration":    assessment.Duration,
		"is_mock":     assessment.IsMock,
		"total_marks": assessment.TotalMarks,
	})
}
