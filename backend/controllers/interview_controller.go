package controllers

import (
	"broassess-backend/models"
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var interviewCollection *mongo.Collection

// InitInterviewController initializes the interview controller with the database collection
func InitInterviewController(collection *mongo.Collection) {
	interviewCollection = collection
}

// CreateInterviewSlot creates a new interview slot (interviewer only)
func CreateInterviewSlot(c *gin.Context) {
	var req models.CreateInterviewSlotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get interviewer ID from context (set by auth middleware)
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	interviewerID := userID.(primitive.ObjectID)

	// Validate scheduled time is in the future
	if req.ScheduledAt.Before(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Scheduled time must be in the future"})
		return
	}

	// Check for overlapping slots for the same interviewer
	endTime := req.ScheduledAt.Add(time.Duration(req.Duration) * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"interviewer_id": interviewerID,
		"status":         bson.M{"$nin": []string{"cancelled", "completed"}},
		"$or": []bson.M{
			{
				"scheduled_at": bson.M{
					"$gte": req.ScheduledAt,
					"$lt":  endTime,
				},
			},
			{
				"$expr": bson.M{
					"$and": []bson.M{
						{"$lte": []interface{}{"$scheduled_at", req.ScheduledAt}},
						{"$gt": []interface{}{
							bson.M{"$add": []interface{}{
								"$scheduled_at",
								bson.M{"$multiply": []interface{}{"$duration", 60000}},
							}},
							req.ScheduledAt,
						}},
					},
				},
			},
		},
	}

	count, err := interviewCollection.CountDocuments(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for overlapping slots"})
		return
	}

	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "This time slot overlaps with an existing interview"})
		return
	}

	// Create the interview slot
	interview := models.Interview{
		ID:            primitive.NewObjectID(),
		InterviewerID: interviewerID,
		CandidateID:   nil,
		Title:         req.Title,
		Description:   req.Description,
		Type:          req.Type,
		ScheduledAt:   req.ScheduledAt,
		Duration:      req.Duration,
		Status:        "available",
		MeetingLink:   req.MeetingLink,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	_, err = interviewCollection.InsertOne(ctx, interview)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create interview slot"})
		return
	}

	c.JSON(http.StatusCreated, interview)
}

// GetAvailableSlots returns all available interview slots (candidate view)
func GetAvailableSlots(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Filter for available slots in the future
	filter := bson.M{
		"status":       "available",
		"scheduled_at": bson.M{"$gte": time.Now()},
	}

	// Optional filters from query params
	if interviewType := c.Query("type"); interviewType != "" {
		filter["type"] = interviewType
	}

	if interviewerID := c.Query("interviewer_id"); interviewerID != "" {
		objID, err := primitive.ObjectIDFromHex(interviewerID)
		if err == nil {
			filter["interviewer_id"] = objID
		}
	}

	// Sort by scheduled time
	opts := options.Find().SetSort(bson.D{{Key: "scheduled_at", Value: 1}})

	cursor, err := interviewCollection.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch available slots"})
		return
	}
	defer cursor.Close(ctx)

	var interviews []models.Interview
	if err = cursor.All(ctx, &interviews); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode interviews"})
		return
	}

	if interviews == nil {
		interviews = []models.Interview{}
	}

	c.JSON(http.StatusOK, interviews)
}

// BookInterview allows a candidate to book an available interview slot
func BookInterview(c *gin.Context) {
	interviewID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(interviewID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid interview ID"})
		return
	}

	// Get candidate ID from context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	candidateID := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find and update the interview slot
	filter := bson.M{
		"_id":    objID,
		"status": "available",
	}

	update := bson.M{
		"$set": bson.M{
			"candidate_id": candidateID,
			"status":       "scheduled",
			"updated_at":   time.Now(),
		},
	}

	var interview models.Interview
	err = interviewCollection.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&interview)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Interview slot not available or already booked"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to book interview"})
		}
		return
	}

	c.JSON(http.StatusOK, interview)
}

// GetMyInterviews returns interviews for the logged-in user (interviewer or candidate)
func GetMyInterviews(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	role, _ := c.Get("role")

	objID := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var filter bson.M
	if role == "interviewer" {
		filter = bson.M{"interviewer_id": objID}
	} else {
		filter = bson.M{"candidate_id": objID}
	}

	// Optional status filter
	if status := c.Query("status"); status != "" {
		filter["status"] = status
	}

	// Sort by scheduled time (descending - most recent first)
	opts := options.Find().SetSort(bson.D{{Key: "scheduled_at", Value: -1}})

	cursor, err := interviewCollection.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch interviews"})
		return
	}
	defer cursor.Close(ctx)

	var interviews []models.Interview
	if err = cursor.All(ctx, &interviews); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode interviews"})
		return
	}

	if interviews == nil {
		interviews = []models.Interview{}
	}

	c.JSON(http.StatusOK, interviews)
}

// UpdateInterview updates an interview (interviewer only)
func UpdateInterview(c *gin.Context) {
	interviewID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(interviewID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid interview ID"})
		return
	}

	var req models.UpdateInterviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	interviewerID := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Build update document
	updateDoc := bson.M{
		"updated_at": time.Now(),
	}

	if req.Title != "" {
		updateDoc["title"] = req.Title
	}
	if req.Description != "" {
		updateDoc["description"] = req.Description
	}
	if req.Type != "" {
		updateDoc["type"] = req.Type
	}
	if !req.ScheduledAt.IsZero() {
		updateDoc["scheduled_at"] = req.ScheduledAt
	}
	if req.Duration > 0 {
		updateDoc["duration"] = req.Duration
	}
	if req.MeetingLink != "" {
		updateDoc["meeting_link"] = req.MeetingLink
	}
	if req.Notes != "" {
		updateDoc["notes"] = req.Notes
	}

	filter := bson.M{
		"_id":            objID,
		"interviewer_id": interviewerID,
	}

	update := bson.M{"$set": updateDoc}

	var interview models.Interview
	err = interviewCollection.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&interview)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Interview not found or you don't have permission"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update interview"})
		}
		return
	}

	c.JSON(http.StatusOK, interview)
}

// CancelInterview cancels an interview
func CancelInterview(c *gin.Context) {
	interviewID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(interviewID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid interview ID"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	userObjID := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Allow both interviewer and candidate to cancel
	filter := bson.M{
		"_id": objID,
		"$or": []bson.M{
			{"interviewer_id": userObjID},
			{"candidate_id": userObjID},
		},
	}

	update := bson.M{
		"$set": bson.M{
			"status":     "cancelled",
			"updated_at": time.Now(),
		},
	}

	var interview models.Interview
	err = interviewCollection.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&interview)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Interview not found or you don't have permission"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel interview"})
		}
		return
	}

	c.JSON(http.StatusOK, interview)
}

// CompleteInterview marks an interview as completed (interviewer only)
func CompleteInterview(c *gin.Context) {
	interviewID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(interviewID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid interview ID"})
		return
	}

	var req models.CompleteInterviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	interviewerID := userID.(primitive.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":            objID,
		"interviewer_id": interviewerID,
	}

	update := bson.M{
		"$set": bson.M{
			"status":     "completed",
			"notes":      req.Notes,
			"updated_at": time.Now(),
		},
	}

	var interview models.Interview
	err = interviewCollection.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&interview)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Interview not found or you don't have permission"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete interview"})
		}
		return
	}

	c.JSON(http.StatusOK, interview)
}
