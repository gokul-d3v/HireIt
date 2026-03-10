package controllers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"hireit-backend/models"
	"hireit-backend/services"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AssessmentController struct {
	assessmentService services.AssessmentService
	submissionService services.SubmissionService
}

func NewAssessmentController(as services.AssessmentService, ss services.SubmissionService) *AssessmentController {
	return &AssessmentController{assessmentService: as, submissionService: ss}
}

// --- Interviewer Methods ---

func (ctrl *AssessmentController) CreateAssessment(c *gin.Context) {
	var assessment models.Assessment
	if err := c.ShouldBindJSON(&assessment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("userID")
	assessment.CreatedBy = userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	id, err := ctrl.assessmentService.CreateAssessment(ctx, &assessment)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create assessment"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Assessment created successfully", "id": id})
}

func (ctrl *AssessmentController) GetAssessments(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	role, _ := c.Get("role")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	assessments, err := ctrl.assessmentService.GetAssessments(ctx, limit, skip, role.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assessments"})
		return
	}

	c.JSON(http.StatusOK, assessments)
}

func (ctrl *AssessmentController) GetAssessmentByID(c *gin.Context) {
	id := c.Param("id")
	role, _ := c.Get("role")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	assessment, err := ctrl.assessmentService.GetAssessmentByID(ctx, id, role.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found"})
		return
	}

	c.JSON(http.StatusOK, assessment)
}

func (ctrl *AssessmentController) UpdateAssessment(c *gin.Context) {
	id := c.Param("id")
	var assessment models.Assessment
	if err := c.ShouldBindJSON(&assessment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := ctrl.assessmentService.UpdateAssessment(ctx, id, &assessment)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update assessment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Assessment updated successfully"})
}

func (ctrl *AssessmentController) DeleteAssessment(c *gin.Context) {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := ctrl.assessmentService.DeleteAssessment(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete assessment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Assessment deleted successfully"})
}

func (ctrl *AssessmentController) GetSubmissions(c *gin.Context) {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	subs, err := ctrl.submissionService.GetSubmissions(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submissions"})
		return
	}
	c.JSON(http.StatusOK, subs)
}

// --- Candidate Methods ---

func (ctrl *AssessmentController) GetCandidateResult(c *gin.Context) {
	assessmentID := c.Param("id")
	candidateID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := ctrl.submissionService.GetCandidateResult(ctx, assessmentID, candidateID.(primitive.ObjectID).Hex())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Result not found"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (ctrl *AssessmentController) SubmitAssessment(c *gin.Context) {
	assessmentID := c.Param("id")
	candidateID, _ := c.Get("userID")

	var input struct {
		Answers    []models.Answer    `json:"answers"`
		Violations []models.Violation `json:"violations"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	submission, err := ctrl.submissionService.SubmitAssessment(ctx, assessmentID, candidateID.(primitive.ObjectID).Hex(), input.Answers, input.Violations)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit assessment"})
		return
	}

	c.JSON(http.StatusOK, submission)
}

func (ctrl *AssessmentController) SaveAssessmentProgress(c *gin.Context) {
	assessmentID := c.Param("id")
	candidateID, _ := c.Get("userID")

	var input struct {
		Answers    []models.Answer    `json:"answers"`
		Violations []models.Violation `json:"violations"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := ctrl.submissionService.SaveProgress(ctx, assessmentID, candidateID.(primitive.ObjectID).Hex(), input.Answers, input.Violations)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save progress"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Progress saved successfully"})
}

func (ctrl *AssessmentController) GetMySubmissions(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	submissions, err := ctrl.submissionService.GetSubmissionsByCandidate(ctx, id.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submissions"})
		return
	}

	c.JSON(http.StatusOK, submissions)
}
