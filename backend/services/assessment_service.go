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
	SampleQuestions(ctx context.Context, rules []models.QuestionRule) ([]models.Question, error)
}

type assessmentService struct {
	repo   repositories.AssessmentRepository
	qbRepo repositories.QuestionBankRepository
}

func NewAssessmentService(repo repositories.AssessmentRepository, qbRepo repositories.QuestionBankRepository) AssessmentService {
	return &assessmentService{repo: repo, qbRepo: qbRepo}
}

func (s *assessmentService) CreateAssessment(ctx context.Context, assessment *models.Assessment) (string, error) {
	// Sanitization
	assessment.Title = utils.SanitizeStrict(assessment.Title)
	assessment.Description = utils.SanitizeStrict(assessment.Description)

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

	filter := bson.M{"deleted_at": nil}
	assessments, err := s.repo.FindAll(ctx, filter, opts)
	if err != nil {
		return nil, err
	}

	// Populate computed QuestionCount
	for i := range assessments {
		total := 0
		for _, r := range assessments[i].QuestionRules {
			total += r.Count
		}
		assessments[i].QuestionCount = total
	}
	return assessments, nil
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

	if assessment.DeletedAt != nil {
		return nil, errors.New("assessment deleted")
	}

	// Calculate and populate QuestionCount
	total := 0
	for _, r := range assessment.QuestionRules {
		total += r.Count
	}
	assessment.QuestionCount = total

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

func (s *assessmentService) SampleQuestions(ctx context.Context, rules []models.QuestionRule) ([]models.Question, error) {
	return sampleQuestionsForRules(ctx, s.qbRepo, rules)
}
