package services

import (
	"context"
	"errors"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SubmissionService interface {
	GetSubmissions(ctx context.Context, assessmentID string) ([]models.Submission, error)
	GetCandidateResult(ctx context.Context, assessmentID, candidateID string) (*models.Submission, error)
	SubmitAssessment(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation) (*models.Submission, error)
	SaveProgress(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation) error
	GetSubmissionsByCandidate(ctx context.Context, candidateID string) ([]models.Submission, error)
}

type submissionService struct {
	repo           repositories.SubmissionRepository
	assessmentRepo repositories.AssessmentRepository
	userRepo       repositories.UserRepository
}

func NewSubmissionService(repo repositories.SubmissionRepository, assessmentRepo repositories.AssessmentRepository, userRepo repositories.UserRepository) SubmissionService {
	return &submissionService{repo: repo, assessmentRepo: assessmentRepo, userRepo: userRepo}
}

func (r *submissionService) GetSubmissions(ctx context.Context, assessmentID string) ([]models.Submission, error) {
	objID, _ := primitive.ObjectIDFromHex(assessmentID)
	// Check if assessment exists and not deleted
	_, err := r.assessmentRepo.FindByID(ctx, objID)
	if err != nil {
		return nil, errors.New("assessment not found or deleted")
	}

	return r.repo.FindAll(ctx, bson.M{"assessment_id": objID, "deleted_at": nil}, options.Find().SetSort(bson.D{{Key: "submitted_at", Value: -1}}))
}

func (r *submissionService) GetCandidateResult(ctx context.Context, assessmentID, candidateID string) (*models.Submission, error) {
	aID, _ := primitive.ObjectIDFromHex(assessmentID)
	cID, _ := primitive.ObjectIDFromHex(candidateID)

	// Check if assessment exists
	_, err := r.assessmentRepo.FindByID(ctx, aID)
	if err != nil {
		return nil, errors.New("assessment not found or deleted")
	}

	return r.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID, "deleted_at": nil})
}

func (s *submissionService) SaveProgress(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation) error {
	aID, _ := primitive.ObjectIDFromHex(assessmentID)
	cID, _ := primitive.ObjectIDFromHex(candidateID)

	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})
	if err != nil {
		// Fetch user details for denormalized submission
		user, _ := s.userRepo.FindByID(ctx, cID)

		// Create new in-progress submission
		submission = &models.Submission{
			AssessmentID: aID,
			CandidateID:  cID,
			CreatedBy:    cID,
			CreatedAt:    time.Now(),
			StartedAt:    time.Now(), // Initialize StartedAt
			Answers:      answers,
			Violations:   violations,
			Status:       "in_progress",
			UpdatedAt:    time.Now(),
		}
		if user != nil {
			submission.CandidateName = user.Name
			submission.CandidateEmail = user.Email
			submission.CandidatePhone = user.Phone
		}
		_, err = s.repo.Create(ctx, submission)
		return err
	}

	if submission.StartedAt.IsZero() {
		submission.StartedAt = time.Now()
	}

	submission.Answers = answers
	if violations != nil {
		submission.Violations = violations
	}
	submission.UpdatedAt = time.Now()
	return s.repo.Update(ctx, submission.ID, submission)
}

func (s *submissionService) SubmitAssessment(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation) (*models.Submission, error) {
	aID, _ := primitive.ObjectIDFromHex(assessmentID)
	cID, _ := primitive.ObjectIDFromHex(candidateID)

	assessment, err := s.assessmentRepo.FindByID(ctx, aID)
	if err != nil {
		return nil, errors.New("assessment not found")
	}

	// Calculate Score
	totalScore := 0
	questionMap := make(map[string]models.Question)
	for _, q := range assessment.Questions {
		questionMap[q.ID.Hex()] = q
	}

	for i := range answers {
		q, ok := questionMap[answers[i].QuestionID.Hex()]
		if ok {
			if q.Type == models.MultipleChoice && q.CorrectAnswer == answers[i].Value {
				answers[i].IsCorrect = true
				answers[i].Points = q.Points
				totalScore += q.Points
			} else {
				answers[i].IsCorrect = false
				answers[i].Points = 0
			}
		}
	}

	passed := totalScore >= assessment.PassingScore

	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})
	if err != nil {
		user, _ := s.userRepo.FindByID(ctx, cID)
		submission = &models.Submission{
			AssessmentID: aID,
			CandidateID:  cID,
			CreatedBy:    cID,
			CreatedAt:    time.Now(),
			StartedAt:    time.Now(),
		}
		if user != nil {
			submission.CandidateName = user.Name
			submission.CandidateEmail = user.Email
			submission.CandidatePhone = user.Phone
		}
		_, _ = s.repo.Create(ctx, submission)
	}

	if submission.StartedAt.IsZero() {
		submission.StartedAt = time.Now()
	}

	submission.Answers = answers
	if violations != nil {
		submission.Violations = violations
	}
	submission.Score = totalScore
	submission.Passed = passed
	submission.Status = "completed"
	submission.SubmittedAt = time.Now()
	submission.UpdatedAt = time.Now()

	err = s.repo.Update(ctx, submission.ID, submission)
	return submission, err
}

func (s *submissionService) GetSubmissionsByCandidate(ctx context.Context, candidateID string) ([]models.Submission, error) {
	cID, err := primitive.ObjectIDFromHex(candidateID)
	if err != nil {
		return nil, err
	}
	return s.repo.FindAll(ctx, bson.M{"candidate_id": cID, "deleted_at": nil}, options.Find().SetSort(bson.D{{Key: "updated_at", Value: -1}}))
}
