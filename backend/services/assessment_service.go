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

type AssessmentService interface {
	CreateAssessment(ctx context.Context, assessment *models.Assessment) (string, error)
	GetAssessments(ctx context.Context, limit, skip int, role string) ([]models.Assessment, error)
	GetAssessmentByID(ctx context.Context, id string, role string) (*models.Assessment, error)
	UpdateAssessment(ctx context.Context, id string, assessment *models.Assessment) error
	DeleteAssessment(ctx context.Context, id string) error
}

type assessmentService struct {
	repo repositories.AssessmentRepository
}

func NewAssessmentService(repo repositories.AssessmentRepository) AssessmentService {
	return &assessmentService{repo: repo}
}

func (s *assessmentService) CreateAssessment(ctx context.Context, assessment *models.Assessment) (string, error) {
	// Sanitization
	assessment.Title = utils.SanitizeStrict(assessment.Title)
	assessment.Description = utils.SanitizeStrict(assessment.Description)
	for i := range assessment.Questions {
		assessment.Questions[i].Text = utils.SanitizeStrict(assessment.Questions[i].Text)
		for j := range assessment.Questions[i].Options {
			assessment.Questions[i].Options[j] = utils.SanitizeStrict(assessment.Questions[i].Options[j])
		}
	}

	assessment.CreatedAt = time.Now()
	assessment.UpdatedAt = time.Now()

	id, err := s.repo.Create(ctx, assessment)
	if err != nil {
		return "", err
	}
	return id.Hex(), nil
}

func (s *assessmentService) GetAssessments(ctx context.Context, limit, skip int, role string) ([]models.Assessment, error) {
	opts := options.Find().
		SetLimit(int64(limit)).
		SetSkip(int64(skip)).
		SetSort(bson.D{{Key: "created_at", Value: -1}})

	// Security: If not interviewer, exclude questions from list view
	if role != "interviewer" {
		opts.SetProjection(bson.M{"questions": 0})
	}

	filter := bson.M{"deleted_at": nil}
	return s.repo.FindAll(ctx, filter, opts)
}

func (s *assessmentService) GetAssessmentByID(ctx context.Context, idStr string, role string) (*models.Assessment, error) {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return nil, err
	}

	assessment, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Security: If candidate, strip correct answers
	if role != "interviewer" {
		for i := range assessment.Questions {
			assessment.Questions[i].CorrectAnswer = "" // Hide correct answer
		}
	}

	if assessment.DeletedAt != nil {
		return nil, errors.New("assessment deleted")
	}

	return assessment, nil
}

func (s *assessmentService) UpdateAssessment(ctx context.Context, idStr string, assessment *models.Assessment) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return err
	}

	// Check if already deleted
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil || existing.DeletedAt != nil {
		return errors.New("assessment not found or deleted")
	}

	assessment.UpdatedAt = time.Now()
	return s.repo.Update(ctx, id, assessment)
}

func (s *assessmentService) DeleteAssessment(ctx context.Context, idStr string) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return err
	}
	now := time.Now()
	update := &models.Assessment{
		DeletedAt: &now,
	}
	return s.repo.Update(ctx, id, update)
}
