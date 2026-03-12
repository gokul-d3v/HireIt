package repositories

import (
	"context"
	"hireit-backend/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type QuestionBankRepository interface {
	Create(ctx context.Context, question *models.QuestionBankEntry) (primitive.ObjectID, error)
	Find(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.QuestionBankEntry, error)
	Sample(ctx context.Context, filter bson.M, size int) ([]models.QuestionBankEntry, error)
}

type mongoQuestionBankRepo struct {
	collection *mongo.Collection
}

func NewQuestionBankRepository(collection *mongo.Collection) QuestionBankRepository {
	return &mongoQuestionBankRepo{collection: collection}
}

func (r *mongoQuestionBankRepo) Create(ctx context.Context, question *models.QuestionBankEntry) (primitive.ObjectID, error) {
	question.ID = primitive.NewObjectID()
	res, err := r.collection.InsertOne(ctx, question)
	if err != nil {
		return primitive.NilObjectID, err
	}
	return res.InsertedID.(primitive.ObjectID), nil
}

func (r *mongoQuestionBankRepo) Find(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.QuestionBankEntry, error) {
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var questions []models.QuestionBankEntry
	if err := cursor.All(ctx, &questions); err != nil {
		return nil, err
	}
	return questions, nil
}

func (r *mongoQuestionBankRepo) Sample(ctx context.Context, filter bson.M, size int) ([]models.QuestionBankEntry, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$sample", Value: bson.M{"size": size}}},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var questions []models.QuestionBankEntry
	if err := cursor.All(ctx, &questions); err != nil {
		return nil, err
	}
	return questions, nil
}
