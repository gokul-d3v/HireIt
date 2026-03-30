package services

import (
	"context"
	"hireit-backend/metrics"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UserService interface {
	ListUsers(ctx context.Context, limit, skip int) ([]models.User, error)
	ToggleUserStatus(ctx context.Context, id string, disabled bool) error
	Heartbeat(ctx context.Context, userID string) error
	GetActiveUserCount(ctx context.Context) (int64, error)
}

type userService struct {
	repo repositories.UserRepository
}

func NewUserService(repo repositories.UserRepository) UserService {
	return &userService{repo: repo}
}

func (s *userService) ListUsers(ctx context.Context, limit, skip int) ([]models.User, error) {
	opts := options.Find().
		SetLimit(int64(limit)).
		SetSkip(int64(skip)).
		SetSort(bson.D{{Key: "created_at", Value: -1}})

	filter := bson.M{"deleted_at": nil, "is_demo": bson.M{"$ne": true}}
	return s.repo.FindAll(ctx, filter, opts)
}

func (s *userService) ToggleUserStatus(ctx context.Context, idStr string, disabled bool) error {
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		return err
	}
	return s.repo.UpdateStatus(ctx, id, disabled)
}

func (s *userService) Heartbeat(ctx context.Context, userID string) error {
	id, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return err
	}
	return s.repo.UpdateLastSeen(ctx, id)
}

func (s *userService) GetActiveUserCount(ctx context.Context) (int64, error) {
	// Active if seen in the last 5 minutes
	since := time.Now().Add(-5 * time.Minute)
	count, err := s.repo.CountActiveUsers(ctx, since)
	if err == nil {
		metrics.UpdateActiveUsers(float64(count))
	}
	return count, err
}
