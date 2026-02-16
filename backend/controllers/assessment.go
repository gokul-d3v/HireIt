package controllers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"hireit-backend/models"
	"hireit-backend/utils"

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

	// Generate IDs for questions if not present
	for i := range assessment.Questions {
		if assessment.Questions[i].ID.IsZero() {
			assessment.Questions[i].ID = primitive.NewObjectID()
		}
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
	userID, _ := c.Get("userID")

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

	// Check if user has already passed this assessment
	var existingSubmission models.Submission
	err = SubmissionCollection.FindOne(ctx, bson.M{"assessment_id": objID, "candidate_id": userID, "passed": true}).Decode(&existingSubmission)
	if err == nil {
		// User already passed, maybe we should let them retake or show result?
		// For now, let's just proceed, but you might want to restrict this.
	}

	// Phase Protection: Check if this is Phase 2 or 3 and if user passed previous phase
	if assessment.Phase > 1 {
		// Find previous phase assessment
		// We need to find an assessment that has NextPhaseID == this assessment.ID
		// This is a bit reverse lookup, ideally assessment should have PreviousPhaseID or we check by Phase number in same series
		// Assuming localized series logic isn't fully linked, let's try to find if there is a submission for a Phase < currentPhase
		// A better way: if we know the previous phase ID.
		// Since we don't have PreviousPhaseID, we can query for an assessment where NextPhaseID is this ID.
		var prevAssessment models.Assessment
		err = AssessmentCollection.FindOne(ctx, bson.M{"next_phase_id": objID}).Decode(&prevAssessment)
		if err == nil {
			// Found previous phase, check if user passed it
			var prevSubmission models.Submission
			err = SubmissionCollection.FindOne(ctx, bson.M{"assessment_id": prevAssessment.ID, "candidate_id": userID, "passed": true}).Decode(&prevSubmission)
			if err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "You must pass the previous phase to access this assessment."})
				return
			}
		}
	}

	// Resume Logic: Check for in-progress submission
	var inProgressSubmission models.Submission
	err = SubmissionCollection.FindOne(ctx, bson.M{
		"assessment_id": objID,
		"candidate_id":  userID,
		"status":        "in_progress",
	}).Decode(&inProgressSubmission)

	savedAnswers := make(map[string]string)
	if err == nil {
		for _, ans := range inProgressSubmission.Answers {
			savedAnswers[ans.QuestionID.Hex()] = ans.Value
		}
	}

	// For candidates: randomize MCQ options and remove correct answers
	if role == "candidate" {
		for i := range assessment.Questions {
			if assessment.Questions[i].Type == models.MultipleChoice && len(assessment.Questions[i].Options) > 0 {
				// Check if we have shuffled options stored in submission
				if len(inProgressSubmission.ShuffledOptions) > 0 {
					if opts, ok := inProgressSubmission.ShuffledOptions[assessment.Questions[i].ID.Hex()]; ok {
						assessment.Questions[i].Options = opts
					}
				} else {
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
			}
			// Remove correct answer from response for candidates
			assessment.Questions[i].CorrectAnswer = ""
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"assessment":    assessment,
		"saved_answers": savedAnswers,
	})
}

func SaveAssessmentProgress(c *gin.Context) {
	assessmentID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(assessmentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Assessment ID"})
		return
	}

	var input struct {
		Answers []models.Answer `json:"answers"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("userID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Update or upsert submission with status "in_progress"
	filter := bson.M{
		"assessment_id": objID,
		"candidate_id":  userID,
		"status":        "in_progress", // Only update in-progress ones
	}

	update := bson.M{
		"$set": bson.M{
			"answers":    input.Answers,
			"updated_at": time.Now(),
		},
		"$setOnInsert": bson.M{
			"_id":           primitive.NewObjectID(),
			"started_at":    time.Now(),
			"status":        "in_progress",
			"assessment_id": objID,
			"candidate_id":  userID,
		},
	}

	opts := options.Update().SetUpsert(true)
	_, err = SubmissionCollection.UpdateOne(ctx, filter, update, opts)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save progress"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Progress saved"})
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

	// Fetch assessment to get TotalMarks and NextPhaseID
	var assessment models.Assessment
	err = AssessmentCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&assessment)
	if err != nil {
		// If assessment is deleted, we can still return submission but without extra info
		// But ideally we want to know the total marks.
		// For now, let's just return the submission if assessment not found (edge case)
		c.JSON(http.StatusOK, submission)
		return
	}

	// Create a response combining submission and assessment details
	response := gin.H{
		"id":                  submission.ID,
		"assessment_id":       submission.AssessmentID,
		"candidate_id":        submission.CandidateID,
		"answers":             submission.Answers,
		"score":               submission.Score,
		"status":              submission.Status,
		"started_at":          submission.StartedAt,
		"submitted_at":        submission.SubmittedAt,
		"passed":              submission.Passed,
		"next_phase_unlocked": submission.NextPhaseUnlocked,
		"total_marks":         assessment.TotalMarks,
		"next_phase_id":       assessment.NextPhaseID,
	}

	c.JSON(http.StatusOK, response)
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
