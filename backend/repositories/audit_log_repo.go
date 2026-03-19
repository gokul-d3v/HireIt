package repositories

import (
	"context"
	"hireit-backend/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type AuditLogRepository interface {
	Create(ctx context.Context, log *models.AuditLog) error
	FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.AuditLog, error)
}

type mongoAuditLogRepo struct {
	collection *mongo.Collection
}

func NewAuditLogRepository(collection *mongo.Collection) AuditLogRepository {
	return &mongoAuditLogRepo{collection: collection}
}

func (r *mongoAuditLogRepo) Create(ctx context.Context, log *models.AuditLog) error {
	_, err := r.collection.InsertOne(ctx, log)
	return err
}

func (r *mongoAuditLogRepo) FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.AuditLog, error) {
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var logs []models.AuditLog
	if err := cursor.All(ctx, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}
