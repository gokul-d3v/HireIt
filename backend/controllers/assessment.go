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

	c.JSON(http.StatusCreated, gin.H{
		"message": "Assessment created successfully",
		"id":      id,
	})
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
	roleStr := role.(string)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	assessment, err := ctrl.assessmentService.GetAssessmentByID(ctx, id, roleStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found"})
		return
	}

	// Inject candidate-specific generated questions and submission status
	var submission *models.Submission
	if roleStr != "interviewer" {
		userID, exists := c.Get("userID")
		if exists {
			candidateID := userID.(primitive.ObjectID).Hex()
			generatedQuestions, err := ctrl.submissionService.GetOrGenerateQuestions(ctx, id, candidateID)
			if err == nil {
				assessment.Questions = generatedQuestions
			}
			// Fetch current submission to get started_at, saved answers, etc.
			submission, _ = ctrl.submissionService.GetCandidateResult(ctx, id, candidateID)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"assessment": assessment,
		"submission": submission,
	})
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
		Answers       []models.Answer       `json:"answers"`
		Violations    []models.Violation    `json:"violations"`
		FaceSnapshots *models.FaceSnapshots `json:"face_snapshots,omitempty"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	submission, err := ctrl.submissionService.SubmitAssessment(ctx, assessmentID, candidateID.(primitive.ObjectID).Hex(), input.Answers, input.Violations, input.FaceSnapshots)
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
		Answers            []models.Answer    `json:"answers"`
		Violations         []models.Violation `json:"violations"`
		CurrentQuestionIndex int                `json:"current_question_index"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := ctrl.submissionService.SaveProgress(ctx, assessmentID, candidateID.(primitive.ObjectID).Hex(), input.Answers, input.Violations, input.CurrentQuestionIndex)
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

func (ctrl *AssessmentController) GetSubmissionsByInterviewer(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	submissions, err := ctrl.submissionService.GetSubmissionsByInterviewer(ctx, id.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch interviewer submissions"})
		return
	}

	c.JSON(http.StatusOK, submissions)
}

func (ctrl *AssessmentController) PreviewQuestions(c *gin.Context) {
	var input struct {
		Rules []models.QuestionRule `json:"question_rules" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	questions, err := ctrl.assessmentService.SampleQuestions(ctx, input.Rules)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sample questions"})
		return
	}

	c.JSON(http.StatusOK, questions)
}

// GetCurrentPIN returns the live 4-digit PIN and the time it next rotates.
// Only interviewers can call this endpoint to share the PIN with candidates.
func (ctrl *AssessmentController) GetCurrentPIN(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pin, rotatesAt, err := ctrl.assessmentService.GetCurrentPIN(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pin":        pin,
		"rotates_at": rotatesAt,
	})
}

// RegeneratePassword regenerates the HMAC secret, which immediately invalidates
// all current and previous PINs for this assessment.
func (ctrl *AssessmentController) RegeneratePassword(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := ctrl.assessmentService.RegenerateSecret(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to regenerate PIN secret"})
		return
	}

	// Return the new current PIN immediately
	pin, rotatesAt, err := ctrl.assessmentService.GetCurrentPIN(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch new PIN"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "PIN secret regenerated. All previous PINs are now invalid.",
		"pin":        pin,
		"rotates_at": rotatesAt,
	})
}
