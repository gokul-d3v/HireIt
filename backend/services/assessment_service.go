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
	CreateAssessment(ctx context.Context, assessment *models.Assessment) (id string, err error)
	GetAssessments(ctx context.Context, limit, skip int, role string) ([]models.Assessment, error)
	GetAssessmentByID(ctx context.Context, id string, role string) (*models.Assessment, error)
	UpdateAssessment(ctx context.Context, id string, assessment *models.Assessment) error
	DeleteAssessment(ctx context.Context, id string) error
	SampleQuestions(ctx context.Context, rules []models.QuestionRule) ([]models.Question, error)
	RegenerateSecret(ctx context.Context, id string) error
	VerifyExamPIN(ctx context.Context, id string, pin string) error
	GetCurrentPIN(ctx context.Context, id string) (pin string, rotatesAt time.Time, err error)
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

	// Auto-generate a per-assessment HMAC secret for non-mock assessments.
	// The secret never leaves the server; the PIN is derived from it on-demand.
	if !assessment.IsMock {
		assessment.ExamPINSecret = utils.GeneratePINSecret()
	}

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

	// Check if already exist and preserve metadata
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil || existing.DeletedAt != nil {
		return errors.New("assessment not found or deleted")
	}

	// Safe Merge: Only overwrite fields if new values are provided (non-zero/non-empty)
	if assessment.Title == "" {
		assessment.Title = existing.Title
	}
	if assessment.Description == "" {
		assessment.Description = existing.Description
	}
	if assessment.Duration == 0 {
		assessment.Duration = existing.Duration
	}
	if assessment.TotalMarks == 0 {
		assessment.TotalMarks = existing.TotalMarks
	}
	if assessment.PassingScore == 0 {
		assessment.PassingScore = existing.PassingScore
	}
	if len(assessment.QuestionRules) == 0 {
		assessment.QuestionRules = existing.QuestionRules
	}
	if !assessment.IsMock && existing.IsMock {
		// If current is false but existing was true, we might want to preserve it?
		// Usually if it's in the JSON as false, it's false. 
		// But for safety, we'll assume is_mock is always sent if intended.
	}

	// Preserve immutable/internal metadata
	assessment.CreatedAt = existing.CreatedAt
	assessment.CreatedBy = existing.CreatedBy
	assessment.ExamPINSecret = existing.ExamPINSecret
	if assessment.ExamPINSecret == "" {
		// Safeguard in case existing was also empty
		assessment.ExamPINSecret = existing.ExamPINSecret 
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

// RegenerateSecret creates a new HMAC secret for an assessment, effectively rotating
// all future PINs. This is the equivalent of the old "regenerate password".
func (s *assessmentService) RegenerateSecret(ctx context.Context, idStr string) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return err
	}

	existing, err := s.repo.FindByID(ctx, id)
	if err != nil || existing.DeletedAt != nil {
		return errors.New("assessment not found")
	}

	update := &models.Assessment{
		ExamPINSecret: utils.GeneratePINSecret(),
		UpdatedAt:     time.Now(),
	}
	return s.repo.Update(ctx, id, update)
}

// GetCurrentPIN returns the current 4-digit PIN visible to the interviewer,
// along with the time it will next rotate.
func (s *assessmentService) GetCurrentPIN(ctx context.Context, idStr string) (string, time.Time, error) {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return "", time.Time{}, errors.New("invalid id")
	}

	assessment, err := s.repo.FindByID(ctx, id)
	if err != nil || assessment.DeletedAt != nil {
		return "", time.Time{}, errors.New("assessment not found")
	}

	if assessment.IsMock || assessment.ExamPINSecret == "" {
		return "", time.Time{}, errors.New("no PIN configured for this assessment")
	}

	pin := utils.CurrentExamPIN(assessment.ExamPINSecret)
	rotatesAt := utils.NextPINRotateAt()
	return pin, rotatesAt, nil
}

// VerifyExamPIN checks the provided 4-digit PIN against the current (and previous)
// 30-minute time window. Once a candidate passes this check, they do not need
// to re-enter the PIN even if it rotates mid-exam.
func (s *assessmentService) VerifyExamPIN(ctx context.Context, idStr string, pin string) error {
	id, err := utils.ToObjectID(idStr)
	if err != nil {
		return errors.New("invalid assessment id")
	}

	assessment, err := s.repo.FindByID(ctx, id)
	if err != nil || assessment.DeletedAt != nil {
		return errors.New("assessment not found")
	}

	// Mock exams have no PIN
	if assessment.IsMock {
		return nil
	}

	if assessment.ExamPINSecret == "" {
		return errors.New("no access code configured")
	}

	if !utils.VerifyExamPIN(assessment.ExamPINSecret, pin) {
		return errors.New("incorrect pin")
	}

	return nil
}
