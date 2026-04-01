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
	"golang.org/x/crypto/bcrypt"
)

type AssessmentService interface {
	CreateAssessment(ctx context.Context, assessment *models.Assessment, expiresAt *time.Time) (id string, plainPassword string, err error)
	GetAssessments(ctx context.Context, limit, skip int, role string) ([]models.Assessment, error)
	GetAssessmentByID(ctx context.Context, id string, role string) (*models.Assessment, error)
	UpdateAssessment(ctx context.Context, id string, assessment *models.Assessment) error
	DeleteAssessment(ctx context.Context, id string) error
	SampleQuestions(ctx context.Context, rules []models.QuestionRule) ([]models.Question, error)
	RegeneratePassword(ctx context.Context, id string, expiresAt *time.Time) (plainPassword string, expiry *time.Time, err error)
	VerifyExamPassword(ctx context.Context, id string, password string) error
}

type assessmentService struct {
	repo   repositories.AssessmentRepository
	qbRepo repositories.QuestionBankRepository
}

func NewAssessmentService(repo repositories.AssessmentRepository, qbRepo repositories.QuestionBankRepository) AssessmentService {
	return &assessmentService{repo: repo, qbRepo: qbRepo}
}

func (s *assessmentService) CreateAssessment(ctx context.Context, assessment *models.Assessment, expiresAt *time.Time) (string, string, error) {
	// Sanitization
	assessment.Title = utils.SanitizeStrict(assessment.Title)
	assessment.Description = utils.SanitizeStrict(assessment.Description)

	assessment.CreatedAt = time.Now()
	assessment.UpdatedAt = time.Now()

	var plainPassword string

	// Auto-generate bcrypt-hashed exam password for non-mock assessments
	if !assessment.IsMock {
		plain := utils.GenerateRandomString(8)
		hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
		if err != nil {
			return "", "", err
		}
		assessment.ExamPasswordHash = string(hash)

		// Default expiry: 7 days unless caller provides one
		if expiresAt != nil {
			assessment.ExamPasswordExpiresAt = expiresAt
		} else {
			defaultExpiry := time.Now().Add(7 * 24 * time.Hour)
			assessment.ExamPasswordExpiresAt = &defaultExpiry
		}
		plainPassword = plain
	}

	id, err := s.repo.Create(ctx, assessment)
	if err != nil {
		return "", "", err
	}
	return id.Hex(), plainPassword, nil
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

// RegeneratePassword creates a fresh exam password, bcrypt-hashes it, persists the hash,
// and returns the plaintext exactly once.
func (s *assessmentService) RegeneratePassword(ctx context.Context, idStr string, expiresAt *time.Time) (string, *time.Time, error) {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return "", nil, err
	}

	existing, err := s.repo.FindByID(ctx, id)
	if err != nil || existing.DeletedAt != nil {
		return "", nil, errors.New("assessment not found")
	}

	plain := utils.GenerateRandomString(8)
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", nil, err
	}

	var expiry time.Time
	if expiresAt != nil {
		expiry = *expiresAt
	} else {
		expiry = time.Now().Add(7 * 24 * time.Hour)
	}

	update := &models.Assessment{
		ExamPasswordHash:      string(hash),
		ExamPasswordExpiresAt: &expiry,
		UpdatedAt:             time.Now(),
	}
	if err := s.repo.Update(ctx, id, update); err != nil {
		return "", nil, err
	}

	return plain, &expiry, nil
}

// VerifyExamPassword checks the provided plaintext password against the stored bcrypt hash
// and validates the expiry. Returns nil on success.
func (s *assessmentService) VerifyExamPassword(ctx context.Context, idStr string, password string) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return errors.New("invalid assessment id")
	}

	assessment, err := s.repo.FindByID(ctx, id)
	if err != nil || assessment.DeletedAt != nil {
		return errors.New("assessment not found")
	}

	// Mock exams have no password
	if assessment.IsMock {
		return nil
	}

	if assessment.ExamPasswordHash == "" {
		return errors.New("no access code configured")
	}

	if assessment.ExamPasswordExpiresAt != nil && time.Now().After(*assessment.ExamPasswordExpiresAt) {
		return errors.New("expired")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(assessment.ExamPasswordHash), []byte(password)); err != nil {
		return errors.New("incorrect password")
	}

	return nil
}

