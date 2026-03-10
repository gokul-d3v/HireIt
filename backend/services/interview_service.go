package services

import (
	"context"
	"errors"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"hireit-backend/utils"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type InterviewService interface {
	CreateSlot(ctx context.Context, interviewerID string, req *models.CreateInterviewSlotRequest) (string, error)
	GetAvailableSlots(ctx context.Context) ([]models.Interview, error)
	BookInterview(ctx context.Context, candidateID string, slotID string) error
	GetMyInterviews(ctx context.Context, userID string, role string) ([]models.Interview, error)
	UpdateInterview(ctx context.Context, id string, update *models.UpdateInterviewRequest) error
	DeleteInterview(ctx context.Context, id string) error
}

type interviewService struct {
	repo repositories.InterviewRepository
}

func NewInterviewService(repo repositories.InterviewRepository) InterviewService {
	return &interviewService{repo: repo}
}

func (s *interviewService) CreateSlot(ctx context.Context, interviewerID string, req *models.CreateInterviewSlotRequest) (string, error) {
	intID, _ := utils.ToObjectID(interviewerID)

	interview := &models.Interview{
		InterviewerID: intID,
		Title:         utils.SanitizeStrict(req.Title),
		Description:   utils.SanitizeStrict(req.Description),
		Type:          utils.SanitizeStrict(req.Type),
		ScheduledAt:   req.ScheduledAt,
		Duration:      req.Duration,
		Status:        "available",
		MeetingLink:   req.MeetingLink,
		CreatedBy:     intID,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	id, err := s.repo.Create(ctx, interview)
	if err != nil {
		return "", err
	}
	return id.Hex(), nil
}

func (s *interviewService) GetAvailableSlots(ctx context.Context) ([]models.Interview, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "scheduled_at", Value: 1}}).
		SetProjection(bson.M{"notes": 0, "candidate_id": 0})

	return s.repo.FindAll(ctx, bson.M{"status": "available", "deleted_at": nil}, opts)
}

func (s *interviewService) BookInterview(ctx context.Context, candidateIDStr string, slotIDStr string) error {
	cID, _ := utils.ToObjectID(candidateIDStr)
	sID, _ := utils.ToObjectID(slotIDStr)

	interview, err := s.repo.FindByID(ctx, sID)
	if err != nil {
		return errors.New("slot not found")
	}

	if interview.Status != "available" {
		return errors.New("slot is no longer available")
	}

	update := bson.M{
		"$set": bson.M{
			"candidate_id": cID,
			"status":       "scheduled",
			"updated_at":   time.Now(),
		},
	}

	return s.repo.Update(ctx, sID, update)
}

func (s *interviewService) GetMyInterviews(ctx context.Context, userID string, role string) ([]models.Interview, error) {
	uID, _ := utils.ToObjectID(userID)
	filter := bson.M{}

	if role == "interviewer" {
		filter["interviewer_id"] = uID
	} else {
		filter["candidate_id"] = uID
	}
	filter["deleted_at"] = nil

	interviews, err := s.repo.FindAll(ctx, filter, options.Find().SetSort(bson.D{{Key: "scheduled_at", Value: 1}}))
	if err != nil {
		return nil, err
	}

	// Security: If candidate, hide notes
	if role != "interviewer" {
		for i := range interviews {
			interviews[i].Notes = ""
		}
	}

	return interviews, nil
}

func (s *interviewService) UpdateInterview(ctx context.Context, idStr string, update *models.UpdateInterviewRequest) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return err
	}

	// Check if deleted
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil || existing.DeletedAt != nil {
		return errors.New("interview not found or deleted")
	}

	upd := bson.M{
		"$set": bson.M{
			"title":        utils.SanitizeStrict(update.Title),
			"description":  utils.SanitizeStrict(update.Description),
			"type":         utils.SanitizeStrict(update.Type),
			"scheduled_at": update.ScheduledAt,
			"duration":     update.Duration,
			"meeting_link": update.MeetingLink,
			"notes":        utils.SanitizeStrict(update.Notes),
			"updated_at":   time.Now(),
		},
	}

	return s.repo.Update(ctx, id, upd)
}

func (s *interviewService) DeleteInterview(ctx context.Context, idStr string) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return err
	}
	now := time.Now()
	upd := bson.M{
		"$set": bson.M{
			"deleted_at": &now,
		},
	}
	return s.repo.Update(ctx, id, upd)
}
