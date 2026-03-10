package repositories

import (
	"context"
	"hireit-backend/models"

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
	_, err := r.collection.ReplaceOne(ctx, bson.M{"_id": id}, submission)
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
