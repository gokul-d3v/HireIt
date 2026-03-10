package repositories

import (
	"context"
	"hireit-backend/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type InterviewRepository interface {
	Create(ctx context.Context, interview *models.Interview) (primitive.ObjectID, error)
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Interview, error)
	FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.Interview, error)
	Update(ctx context.Context, id primitive.ObjectID, update bson.M) error
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type mongoInterviewRepo struct {
	collection *mongo.Collection
}

func NewInterviewRepository(collection *mongo.Collection) InterviewRepository {
	return &mongoInterviewRepo{collection: collection}
}

func (r *mongoInterviewRepo) Create(ctx context.Context, interview *models.Interview) (primitive.ObjectID, error) {
	res, err := r.collection.InsertOne(ctx, interview)
	if err != nil {
		return primitive.NilObjectID, err
	}
	return res.InsertedID.(primitive.ObjectID), nil
}

func (r *mongoInterviewRepo) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Interview, error) {
	var interview models.Interview
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&interview)
	if err != nil {
		return nil, err
	}
	return &interview, nil
}

func (r *mongoInterviewRepo) FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.Interview, error) {
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var interviews []models.Interview
	if err := cursor.All(ctx, &interviews); err != nil {
		return nil, err
	}
	return interviews, nil
}

func (r *mongoInterviewRepo) Update(ctx context.Context, id primitive.ObjectID, update bson.M) error {
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

func (r *mongoInterviewRepo) Delete(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}
