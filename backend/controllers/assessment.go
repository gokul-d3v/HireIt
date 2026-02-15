package controllers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"broassess-backend/models"
	"broassess-backend/utils"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var AssessmentCollection *mongo.Collection
var SubmissionCollection *mongo.Collection

const (
	assessmentsCacheKey = "assessments_list"
	cacheTTL            = 5 * time.Minute
)

func InitAssessmentController(collection *mongo.Collection) {
	AssessmentCollection = collection
}

func InitSubmissionController(collection *mongo.Collection) {
	SubmissionCollection = collection
}

func CreateAssessment(c *gin.Context) {
	var assessment models.Assessment
	if err := c.ShouldBindJSON(&assessment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	assessment.ID = primitive.NewObjectID()
	assessment.CreatedAt = time.Now()
	assessment.UpdatedAt = time.Now()

	// Set CreatedBy from the authenticated user context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	assessment.CreatedBy = userID.(primitive.ObjectID) // Assuming userID is stored as ObjectID in context

	role, _ := c.Get("role")
	if role != "interviewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only interviewers can create assessments"})
		return
	}

	// Generate IDs for questions if not present
	for i := range assessment.Questions {
		if assessment.Questions[i].ID.IsZero() {
			assessment.Questions[i].ID = primitive.NewObjectID()
		}
	}

	// Use context with timeout for database write
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := AssessmentCollection.InsertOne(ctx, assessment)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create assessment"})
		return
	}

	// Invalidate cache after creating new assessment
	cache := utils.GetCache()
	cache.Delete(assessmentsCacheKey)

	c.JSON(http.StatusCreated, gin.H{"message": "Assessment created successfully", "id": assessment.ID})
}

func UpdateAssessment(c *gin.Context) {
	id := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var assessment models.Assessment
	if err := c.ShouldBindJSON(&assessment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	assessment.UpdatedAt = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Check permission: only creator can update
	userID, _ := c.Get("userID")
	filter := bson.M{"_id": objID, "created_by": userID}

	update := bson.M{
		"$set": bson.M{
			"title":         assessment.Title,
			"description":   assessment.Description,
			"duration":      assessment.Duration,
			"questions":     assessment.Questions,
			"phase":         assessment.Phase,
			"passing_score": assessment.PassingScore,
			"total_marks":   assessment.TotalMarks,
			"next_phase_id": assessment.NextPhaseID,
			"updated_at":    assessment.UpdatedAt,
		},
	}

	result, err := AssessmentCollection.UpdateOne(ctx, filter, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update assessment"})
		return
	}

	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found or permission denied"})
		return
	}

	// Invalidate cache
	utils.GetCache().Delete(assessmentsCacheKey)

	c.JSON(http.StatusOK, gin.H{"message": "Assessment updated successfully"})
}

func DeleteAssessment(c *gin.Context) {
	id := c.Param("id")
	startID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userID, _ := c.Get("userID")

	// Start deletion process
	currentID := startID
	deletedCount := 0

	for {
		var assessment models.Assessment
		// Verify ownership and get NextPhaseID before deleting
		err := AssessmentCollection.FindOne(ctx, bson.M{"_id": currentID, "created_by": userID}).Decode(&assessment)
		if err != nil {
			// If we can't find it or don't own it, we stop.
			// If this is the first item and we fail, return error.
			if deletedCount == 0 {
				c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found or permission denied"})
				return
			}
			break
		}

		nextID := assessment.NextPhaseID

		// Delete the current assessment
		_, err = AssessmentCollection.DeleteOne(ctx, bson.M{"_id": currentID})
		if err != nil {
			// If we fail to delete halfway, we just stop and report partial success or error
			// For now, logging and stopping is acceptable
			break
		}
		deletedCount++

		// Move to next
		if nextID == nil {
			break
		}
		currentID = *nextID
	}

	// Invalidate cache
	utils.GetCache().Delete(assessmentsCacheKey)

	c.JSON(http.StatusOK, gin.H{"message": "Assessment and linked phases deleted successfully", "deleted_count": deletedCount})
}

func GetAssessments(c *gin.Context) {
	// Check cache first
	cache := utils.GetCache()
	if cachedData, found := cache.Get(assessmentsCacheKey); found {
		c.JSON(http.StatusOK, cachedData)
		return
	}

	// Parse pagination parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	skip := (page - 1) * limit

	// Use context with timeout for database query
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Set options for pagination and sorting
	findOptions := options.Find().
		SetLimit(int64(limit)).
		SetSkip(int64(skip)).
		SetSort(bson.D{{Key: "created_at", Value: -1}}) // Most recent first

	var assessments []models.Assessment
	cursor, err := AssessmentCollection.Find(ctx, bson.M{}, findOptions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assessments"})
		return
	}
	defer cursor.Close(ctx)

	if err = cursor.All(ctx, &assessments); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse assessments"})
		return
	}

	// Cache the result for first page only (most common request)
	if page == 1 {
		cache.Set(assessmentsCacheKey, assessments, cacheTTL)
	}

	c.JSON(http.StatusOK, assessments)
}

func GetMyAssessments(c *gin.Context) {
	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var assessments []models.Assessment
	cursor, err := AssessmentCollection.Find(ctx, bson.M{"created_by": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assessments"})
		return
	}
	defer cursor.Close(ctx)

	if err = cursor.All(ctx, &assessments); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse assessments"})
		return
	}

	c.JSON(http.StatusOK, assessments)
}

func GetAssessmentByID(c *gin.Context) {
	id := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Use context with timeout for database query
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var assessment models.Assessment
	err = AssessmentCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&assessment)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found"})
		return
	}

	// Get user role
	role, _ := c.Get("role")

	// For candidates: randomize MCQ options and remove correct answers
	if role == "candidate" {
		for i := range assessment.Questions {
			if assessment.Questions[i].Type == models.MultipleChoice && len(assessment.Questions[i].Options) > 0 {
				// Shuffle options using Fisher-Yates algorithm
				options := make([]string, len(assessment.Questions[i].Options))
				copy(options, assessment.Questions[i].Options)

				// Shuffle
				for j := len(options) - 1; j > 0; j-- {
					k := int(time.Now().UnixNano() % int64(j+1))
					options[j], options[k] = options[k], options[j]
				}

				assessment.Questions[i].Options = options
			}
			// Remove correct answer from response for candidates
			assessment.Questions[i].CorrectAnswer = ""
		}
	}

	c.JSON(http.StatusOK, assessment)
}

func SubmitAssessment(c *gin.Context) {
	assessmentID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(assessmentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Assessment ID"})
		return
	}

	var submission models.Submission
	if err := c.ShouldBindJSON(&submission); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("userID")
	submission.CandidateID = userID.(primitive.ObjectID)
	submission.AssessmentID = objID
	submission.SubmittedAt = time.Now()
	submission.Status = "submitted"

	// Fetch assessment to grade logic
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var assessment models.Assessment
	err = AssessmentCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&assessment)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assessment not found"})
		return
	}

	// Calculate Score and mark each answer as correct/incorrect
	totalScore := 0
	for i, answer := range submission.Answers {
		for _, question := range assessment.Questions {
			if question.ID == answer.QuestionID {
				if question.Type == models.MultipleChoice {
					if answer.Value == question.CorrectAnswer {
						submission.Answers[i].IsCorrect = true
						submission.Answers[i].Points = question.Points
						totalScore += question.Points
					} else {
						submission.Answers[i].IsCorrect = false
						submission.Answers[i].Points = 0
					}
				}
				// Subjective/Coding questions need manual grading
				break
			}
		}
	}

	submission.Score = totalScore

	// Check if passed and unlock next phase
	submission.Passed = totalScore >= assessment.PassingScore
	submission.NextPhaseUnlocked = submission.Passed && assessment.NextPhaseID != nil

	submission.ID = primitive.NewObjectID()

	insertCtx, insertCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer insertCancel()

	_, err = SubmissionCollection.InsertOne(insertCtx, submission)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit assessment"})
		return
	}

	response := gin.H{
		"message":             "Assessment submitted successfully",
		"score":               totalScore,
		"total_marks":         assessment.TotalMarks,
		"passed":              submission.Passed,
		"next_phase_unlocked": submission.NextPhaseUnlocked,
	}

	if submission.NextPhaseUnlocked {
		response["next_phase_id"] = assessment.NextPhaseID
	}

	c.JSON(http.StatusCreated, response)
}

func GetSubmissions(c *gin.Context) {
	assessmentID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(assessmentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Assessment ID"})
		return
	}

	// Check permission: only creator can view submissions
	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Verify ownership
	count, err := AssessmentCollection.CountDocuments(ctx, bson.M{"_id": objID, "created_by": userID})
	if err != nil || count == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
		return
	}

	var submissions []models.Submission
	// Sort by submitted_at desc
	opts := options.Find().SetSort(bson.D{{Key: "submitted_at", Value: -1}})
	cursor, err := SubmissionCollection.Find(ctx, bson.M{"assessment_id": objID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submissions"})
		return
	}
	defer cursor.Close(ctx)

	if err = cursor.All(ctx, &submissions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse submissions"})
		return
	}

	// Collect Candidate IDs
	candidateIDs := make([]primitive.ObjectID, 0)
	for _, sub := range submissions {
		candidateIDs = append(candidateIDs, sub.CandidateID)
	}

	// Fetch Users
	var users []models.User
	userCursor, err := UserCollection.Find(ctx, bson.M{"_id": bson.M{"$in": candidateIDs}})
	if err != nil {
		// Log error but continue with empty user map
		println("Error fetching users:", err.Error())
	} else {
		userCursor.All(ctx, &users)
	}

	// Map Users
	userMap := make(map[primitive.ObjectID]models.User)
	for _, u := range users {
		userMap[u.ID] = u
	}

	// Create Response
	type SubmissionResponse struct {
		models.Submission `bson:",inline"`
		CandidateName     string `json:"candidate_name"`
		CandidateEmail    string `json:"candidate_email"`
		CandidatePhone    string `json:"candidate_phone"`
	}

	response := make([]SubmissionResponse, 0)
	for _, sub := range submissions {
		user, exists := userMap[sub.CandidateID]
		name := "Unknown"
		email := "Unknown"
		phone := ""
		if exists {
			name = user.Name
			email = user.Email
			phone = user.Phone
		} else if !sub.CandidateID.IsZero() {
			// Fallback if user deleted or not found but ID exists
			name = "Deleted User"
		}

		response = append(response, SubmissionResponse{
			Submission:     sub,
			CandidateName:  name,
			CandidateEmail: email,
			CandidatePhone: phone,
		})
	}

	c.JSON(http.StatusOK, response)
}

func GetCandidateResult(c *gin.Context) {
	assessmentID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(assessmentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Assessment ID"})
		return
	}

	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var submission models.Submission
	err = SubmissionCollection.FindOne(ctx, bson.M{"assessment_id": objID, "candidate_id": userID}).Decode(&submission)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Result not found"})
		return
	}

	c.JSON(http.StatusOK, submission)
}

func GetMySubmissions(c *gin.Context) {
	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var submissions []models.Submission
	// Fetch all submissions for the logged-in candidate
	cursor, err := SubmissionCollection.Find(ctx, bson.M{"candidate_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submissions"})
		return
	}
	defer cursor.Close(ctx)

	if err = cursor.All(ctx, &submissions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse submissions"})
		return
	}

	c.JSON(http.StatusOK, submissions)
}
