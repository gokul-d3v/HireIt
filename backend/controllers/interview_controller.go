package controllers

import (
	"context"
	"net/http"
	"time"

	"hireit-backend/models"
	"hireit-backend/services"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type InterviewController struct {
	interviewService services.InterviewService
}

func NewInterviewController(interviewService services.InterviewService) *InterviewController {
	return &InterviewController{interviewService: interviewService}
}

func (ctrl *InterviewController) CreateInterviewSlot(c *gin.Context) {
	var req models.CreateInterviewSlotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	id, err := ctrl.interviewService.CreateSlot(ctx, userID.(primitive.ObjectID).Hex(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create interview slot"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Interview slot created successfully", "id": id})
}

func (ctrl *InterviewController) GetAvailableSlots(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	slots, err := ctrl.interviewService.GetAvailableSlots(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch slots"})
		return
	}

	c.JSON(http.StatusOK, slots)
}

func (ctrl *InterviewController) BookInterview(c *gin.Context) {
	slotID := c.Param("id")
	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := ctrl.interviewService.BookInterview(ctx, userID.(primitive.ObjectID).Hex(), slotID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Interview booked successfully"})
}

func (ctrl *InterviewController) GetMyInterviews(c *gin.Context) {
	userID, _ := c.Get("userID")
	role, _ := c.Get("role")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	interviews, err := ctrl.interviewService.GetMyInterviews(ctx, userID.(primitive.ObjectID).Hex(), role.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch interviews"})
		return
	}

	c.JSON(http.StatusOK, interviews)
}

func (ctrl *InterviewController) UpdateInterview(c *gin.Context) {
	id := c.Param("id")
	var req models.UpdateInterviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := ctrl.interviewService.UpdateInterview(ctx, id, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update interview"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Interview updated successfully"})
}

func (ctrl *InterviewController) DeleteInterviewSlot(c *gin.Context) {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := ctrl.interviewService.DeleteInterview(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete slot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Interview slot deleted successfully"})
}
