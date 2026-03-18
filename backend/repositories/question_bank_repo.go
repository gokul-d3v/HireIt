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
	DeleteByID(ctx context.Context, id primitive.ObjectID) error
	DeleteByFilter(ctx context.Context, filter bson.M) (int64, error)
	Update(ctx context.Context, id primitive.ObjectID, question *models.QuestionBankEntry) error
	CountByFilter(ctx context.Context, filter bson.M) (int64, error)

	SaveBankConfig(ctx context.Context, config *models.QuestionBankConfig) error
	GetBankConfig(ctx context.Context) (*models.QuestionBankConfig, error)
}

type mongoQuestionBankRepo struct {
	collection       *mongo.Collection
	configCollection *mongo.Collection
}

func NewQuestionBankRepository(collection *mongo.Collection, configCollection *mongo.Collection) QuestionBankRepository {
	return &mongoQuestionBankRepo{
		collection:       collection,
		configCollection: configCollection,
	}
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

func (r *mongoQuestionBankRepo) DeleteByID(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *mongoQuestionBankRepo) DeleteByFilter(ctx context.Context, filter bson.M) (int64, error) {
	res, err := r.collection.DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func (r *mongoQuestionBankRepo) Update(ctx context.Context, id primitive.ObjectID, question *models.QuestionBankEntry) error {
	_, err := r.collection.ReplaceOne(ctx, bson.M{"_id": id}, question)
	return err
}

func (r *mongoQuestionBankRepo) CountByFilter(ctx context.Context, filter bson.M) (int64, error) {
	return r.collection.CountDocuments(ctx, filter)
}

func (r *mongoQuestionBankRepo) SaveBankConfig(ctx context.Context, config *models.QuestionBankConfig) error {
	// We only keep one config document. Use a fixed ID or just ReplaceOne with upsert.
	opts := options.Replace().SetUpsert(true)

	// Ensure we use a consistent ID for the singleton config
	const configID = "default_bank_config"
	id, _ := primitive.ObjectIDFromHex("507f1f77bcf86cd799439011") // Arbitrary consistent ID
	config.ID = id

	_, err := r.configCollection.ReplaceOne(ctx, bson.M{"_id": config.ID}, config, opts)
	return err
}

func (r *mongoQuestionBankRepo) GetBankConfig(ctx context.Context) (*models.QuestionBankConfig, error) {
	var config models.QuestionBankConfig
	err := r.configCollection.FindOne(ctx, bson.M{}).Decode(&config)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil // Not found is okay
		}
		return nil, err
	}
	return &config, nil
}
