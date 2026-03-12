package repositories

import (
	"context"
	"fmt"
	"hireit-backend/models"
	"hireit-backend/utils"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SubmissionRepository interface {
	Create(ctx context.Context, submission *models.Submission) (primitive.ObjectID, error)
	Update(ctx context.Context, id primitive.ObjectID, submission *models.Submission) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Submission, error)
	FindOne(ctx context.Context, filter bson.M) (*models.Submission, error)
	FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.Submission, error)
	AddVideoEvidence(ctx context.Context, candidateID, assessmentID primitive.ObjectID, timestamp string, videoURL string) error
}

type mongoSubmissionRepo struct {
	collection *mongo.Collection
}

func NewSubmissionRepository(collection *mongo.Collection) SubmissionRepository {
	return &mongoSubmissionRepo{collection: collection}
}

func (r *mongoSubmissionRepo) Create(ctx context.Context, submission *models.Submission) (primitive.ObjectID, error) {
	submission.ID = primitive.NewObjectID()
	res, err := r.collection.InsertOne(ctx, submission)
	if err != nil {
		return primitive.NilObjectID, err
	}
	return res.InsertedID.(primitive.ObjectID), nil
}

func (r *mongoSubmissionRepo) Update(ctx context.Context, id primitive.ObjectID, submission *models.Submission) error {
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": submission})
	return err
}

func (r *mongoSubmissionRepo) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Submission, error) {
	var sub models.Submission
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&sub)
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

func (r *mongoSubmissionRepo) FindOne(ctx context.Context, filter bson.M) (*models.Submission, error) {
	var sub models.Submission
	err := r.collection.FindOne(ctx, filter).Decode(&sub)
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

func (r *mongoSubmissionRepo) FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.Submission, error) {
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var subs []models.Submission
	if err := cursor.All(ctx, &subs); err != nil {
		return nil, err
	}
	return subs, nil
}

func (r *mongoSubmissionRepo) AddVideoEvidence(ctx context.Context, candidateID, assessmentID primitive.ObjectID, timestamp string, videoURL string) error {
	logger := utils.GetLogger()
	logger.Infof("Attempt TS: %s, URL: %s, CID: %s, AID: %s", timestamp, videoURL, candidateID.Hex(), assessmentID.Hex())
	fmt.Printf("[DB Update] Attempting to link video for Candidate: %s, Assessment: %s, TS: %s\n", candidateID.Hex(), assessmentID.Hex(), timestamp)
	
	filter := bson.M{
		"candidate_id":  candidateID,
		"assessment_id": assessmentID,
	}

	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		submission, err := r.FindOne(ctx, filter)
		if err != nil {
			logger.Errorf("Submission not found (attempt %d): %v", attempt, err)
			if attempt == maxRetries {
				return err
			}
			time.Sleep(5 * time.Second)
			continue
		}

		// Parse the incoming timestamp
		targetTime, err := time.Parse(time.RFC3339, timestamp)
		if err != nil {
			// Try without fractional seconds if first fails
			targetTime, err = time.Parse("2006-01-02T15:04:05Z", timestamp)
		}

		if err != nil {
			logger.Errorf("TS parse fail: %v for %s", err, timestamp)
		}

		found := false
		for i, v := range submission.Violations {
			// Compare with 2 second tolerance due to potential marshaling differences
			diff := v.Timestamp.Sub(targetTime)
			if diff < 0 {
				diff = -diff
			}
			
			if diff < 2*time.Second {
				logger.Infof("Match! Index %d, DB TS: %s (attempt %d)", i, v.Timestamp.Format(time.RFC3339), attempt)
				fmt.Printf("[DB Update] Match found! Updating violation %d with evidence %s\n", i, videoURL)
				submission.Violations[i].Evidence = videoURL
				found = true
				break
			}
		}

		if found {
			err = r.Update(ctx, submission.ID, submission)
			if err != nil {
				logger.Errorf("Update failed: %v", err)
			} else {
				logger.Info("Update success")
			}
			return err
		}

		// Not found, wait and retry
		if attempt < maxRetries {
			logger.Warnf("No match found for %s (attempt %d). DB has %d violations. Retrying in 5s...", timestamp, attempt, len(submission.Violations))
			if len(submission.Violations) > 0 {
				for i, v := range submission.Violations {
					logger.Infof(" [Existing V%d] TS: %s", i, v.Timestamp.Format(time.RFC3339))
				}
			}
			time.Sleep(5 * time.Second)
		} else {
			logger.Warnf("No match found for %s after %d attempts. Total violations: %d", timestamp, maxRetries, len(submission.Violations))
			// Log existing violations for final debug
			for i, v := range submission.Violations {
				fmt.Printf(" [Violation %d] TS: %s, Type: %s\n", i, v.Timestamp.Format(time.RFC3339), v.Type)
				logger.Infof(" [Final Check V%d] TS: %s", i, v.Timestamp.Format(time.RFC3339))
			}
		}
	}

	return fmt.Errorf("no matching violation found for timestamp %s after retries", timestamp)
}
