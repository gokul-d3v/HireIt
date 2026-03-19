package services

import (
	"context"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type AuditLogService interface {
	RecordLog(ctx context.Context, log *models.AuditLog) error
	RecordAction(ctx context.Context, userID primitive.ObjectID, userEmail, action, entityType string, entityID primitive.ObjectID, status, message, errStr string, metadata map[string]interface{}) error
	GetLogs(ctx context.Context, filter bson.M) ([]models.AuditLog, error)
}

type auditLogService struct {
	repo repositories.AuditLogRepository
}

func NewAuditLogService(repo repositories.AuditLogRepository) AuditLogService {
	return &auditLogService{repo: repo}
}

func (s *auditLogService) RecordLog(ctx context.Context, log *models.AuditLog) error {
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now()
	}
	return s.repo.Create(ctx, log)
}

func (s *auditLogService) RecordAction(ctx context.Context, userID primitive.ObjectID, userEmail, action, entityType string, entityID primitive.ObjectID, status, message, errStr string, metadata map[string]interface{}) error {
	log := &models.AuditLog{
		Action:     action,
		UserID:     userID,
		UserEmail:  userEmail,
		EntityType: entityType,
		EntityID:   entityID,
		Status:     status,
		Message:    message,
		Error:      errStr,
		Metadata:   metadata,
		CreatedAt:  time.Now(),
	}
	return s.repo.Create(ctx, log)
}

func (s *auditLogService) GetLogs(ctx context.Context, filter bson.M) ([]models.AuditLog, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	return s.repo.FindAll(ctx, filter, opts)
}
