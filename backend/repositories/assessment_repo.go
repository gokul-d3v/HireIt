package repositories

import (
	"context"
	"hireit-backend/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type AssessmentRepository interface {
	Create(ctx context.Context, assessment *models.Assessment) (primitive.ObjectID, error)
	FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.Assessment, error)
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Assessment, error)
	Update(ctx context.Context, id primitive.ObjectID, assessment *models.Assessment) error
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type mongoAssessmentRepo struct {
	collection *mongo.Collection
}

func NewAssessmentRepository(collection *mongo.Collection) AssessmentRepository {
	return &mongoAssessmentRepo{collection: collection}
}

func (r *mongoAssessmentRepo) Create(ctx context.Context, assessment *models.Assessment) (primitive.ObjectID, error) {
	res, err := r.collection.InsertOne(ctx, assessment)
	if err != nil {
		return primitive.NilObjectID, err
	}
	return res.InsertedID.(primitive.ObjectID), nil
}

func (r *mongoAssessmentRepo) FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.Assessment, error) {
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var assessments []models.Assessment
	if err := cursor.All(ctx, &assessments); err != nil {
		return nil, err
	}
	return assessments, nil
}

func (r *mongoAssessmentRepo) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Assessment, error) {
	var assessment models.Assessment
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&assessment)
	if err != nil {
		return nil, err
	}
	return &assessment, nil
}

func (r *mongoAssessmentRepo) Update(ctx context.Context, id primitive.ObjectID, assessment *models.Assessment) error {
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": assessment})
	return err
}

func (r *mongoAssessmentRepo) Delete(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}
