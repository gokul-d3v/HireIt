package services

import (
	"context"
	"errors"
	"fmt"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SubmissionService interface {
	GetSubmissions(ctx context.Context, assessmentID string) ([]models.Submission, error)
	GetCandidateResult(ctx context.Context, assessmentID, candidateID string) (*models.Submission, error)
	SubmitAssessment(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation, faceSnapshots *models.FaceSnapshots) (*models.Submission, error)
	SaveProgress(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation) error
	GetSubmissionsByCandidate(ctx context.Context, candidateID string) ([]models.Submission, error)
	GetSubmissionsByInterviewer(ctx context.Context, interviewerID string) ([]models.Submission, error)
	GetOrGenerateQuestions(ctx context.Context, assessmentID, candidateID string) ([]models.Question, error)
}

type submissionService struct {
	repo           repositories.SubmissionRepository
	assessmentRepo repositories.AssessmentRepository
	userRepo       repositories.UserRepository
	qbRepo         repositories.QuestionBankRepository
}

func NewSubmissionService(repo repositories.SubmissionRepository, assessmentRepo repositories.AssessmentRepository, userRepo repositories.UserRepository, qbRepo repositories.QuestionBankRepository) SubmissionService {
	return &submissionService{repo: repo, assessmentRepo: assessmentRepo, userRepo: userRepo, qbRepo: qbRepo}
}

func (r *submissionService) GetSubmissions(ctx context.Context, assessmentID string) ([]models.Submission, error) {
	objID, _ := primitive.ObjectIDFromHex(assessmentID)
	// Check if assessment exists and not deleted
	_, err := r.assessmentRepo.FindByID(ctx, objID)
	if err != nil {
		return nil, errors.New("assessment not found or deleted")
	}

	subs, err := r.repo.FindAll(ctx, bson.M{"assessment_id": objID, "deleted_at": nil}, options.Find().SetSort(bson.D{{Key: "submitted_at", Value: -1}}))
	if err != nil {
		return nil, err
	}

	// Deduplicate by candidate_id
	seen := make(map[string]bool)
	var uniqueSubs []models.Submission
	for _, s := range subs {
		key := s.CandidateID.Hex()
		if !seen[key] {
			uniqueSubs = append(uniqueSubs, s)
			seen[key] = true
		}
	}
	return uniqueSubs, nil
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
		// Preserve existing video URLs if they were already updated by AddVideoEvidence
		// This prevents the "auto-save" from overwriting the URL back to base64
		if len(submission.Violations) > 0 {
			for i, newV := range violations {
				for _, oldV := range submission.Violations {
					// Match by timestamp (with 2s tolerance)
					diff := oldV.Timestamp.Sub(newV.Timestamp)
					if diff < 0 {
						diff = -diff
					}
					if diff < 2*time.Second && strings.HasPrefix(oldV.Evidence, "/") {
						violations[i].Evidence = oldV.Evidence
						break
					}
				}
			}
		}
		submission.Violations = violations
	}
	submission.UpdatedAt = time.Now()
	return s.repo.Update(ctx, submission.ID, submission)
}

func (s *submissionService) SubmitAssessment(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation, faceSnapshots *models.FaceSnapshots) (*models.Submission, error) {
	aID, _ := primitive.ObjectIDFromHex(assessmentID)
	cID, _ := primitive.ObjectIDFromHex(candidateID)

	assessment, err := s.assessmentRepo.FindByID(ctx, aID)
	if err != nil {
		return nil, errors.New("assessment not found")
	}

	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})
	if err != nil {
		return nil, errors.New("submission not found")
	}

	// Calculate Score using the dynamically generated questions locked to this submission
	totalScore := 0
	questionMap := make(map[string]models.Question)
	for _, q := range submission.GeneratedQuestions {
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

	if submission.StartedAt.IsZero() {
		submission.StartedAt = time.Now()
	}

	submission.Answers = answers
	if violations != nil {
		submission.Violations = violations
	}
	if faceSnapshots != nil {
		submission.FaceSnapshots = faceSnapshots

		// Upload to telegram asynchronously to avoid blocking the submission
		go func(sub *models.Submission, snapshots *models.FaceSnapshots) {
			// 1. Initial Match Info
			msg := "📸 <b>Face Snapshot Verification Submitted</b>\n"
			msg += "Assessment: " + sub.AssessmentID.Hex() + "\n"
			msg += "Candidate: " + sub.CandidateName + " (" + sub.CandidateEmail + ")\n"
			
			if snapshots.InitialVsMiddleDistance != nil {
				msg += fmt.Sprintf("\nMatch (Initial vs Middle): <b>%.2f</b> (Lower is better)", *snapshots.InitialVsMiddleDistance)
			}
			if snapshots.InitialVsEndDistance != nil {
				msg += fmt.Sprintf("\nMatch (Initial vs End): <b>%.2f</b> (Lower is better)", *snapshots.InitialVsEndDistance)
			}
			SendTelegramMessage(msg)

			// 2. Upload Actual Snapshots to Telegram and Swap with Proxy URL
			if snapshots.InitialImage != "" && !strings.HasPrefix(snapshots.InitialImage, "/api/telegram") {
				fid, err := SendTelegramPhoto(snapshots.InitialImage, "<b>Initial Verification Snapshot</b>\nCandidate: "+sub.CandidateName)
				if err == nil {
					snapshots.InitialImage = "/api/telegram/image/" + fid
				}
			}
			if snapshots.MiddleImage != "" && !strings.HasPrefix(snapshots.MiddleImage, "/api/telegram") {
				fid, err := SendTelegramPhoto(snapshots.MiddleImage, "<b>Mid-Exam Verification Snapshot</b>\nCandidate: "+sub.CandidateName)
				if err == nil {
					snapshots.MiddleImage = "/api/telegram/image/" + fid
				}
			}
			if snapshots.EndImage != "" && !strings.HasPrefix(snapshots.EndImage, "/api/telegram") {
				fid, err := SendTelegramPhoto(snapshots.EndImage, "<b>Final Submission Snapshot</b>\nCandidate: "+sub.CandidateName)
				if err == nil {
					snapshots.EndImage = "/api/telegram/image/" + fid
				}
			}

			// 3. Update the submission in DB with the new proxy URLs (offloading Base64)
			// (Since this is in a goroutine, we need to save the snapshots back to DB)
			_ = s.repo.Update(ctx, sub.ID, sub)
		}(submission, faceSnapshots)
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

func (s *submissionService) GetSubmissionsByInterviewer(ctx context.Context, interviewerID string) ([]models.Submission, error) {
	objID, err := primitive.ObjectIDFromHex(interviewerID)
	if err != nil {
		return nil, errors.New("invalid interviewer ID")
	}

	// 1. Fetch assessments created by this interviewer
	assessments, err := s.assessmentRepo.FindAll(ctx, bson.M{"created_by": objID, "deleted_at": nil}, options.Find())
	if err != nil {
		return nil, err
	}

	if len(assessments) == 0 {
		return []models.Submission{}, nil
	}

	var assessmentIDs []primitive.ObjectID
	for _, a := range assessments {
		assessmentIDs = append(assessmentIDs, a.ID)
	}

	// 2. Fetch submissions for these assessments
	subs, err := s.repo.FindAll(ctx, bson.M{"assessment_id": bson.M{"$in": assessmentIDs}}, options.Find().SetSort(bson.D{{Key: "submitted_at", Value: -1}}))
	if err != nil {
		return nil, err
	}

	// 3. Deduplicate by candidate_id and assessment_id
	seen := make(map[string]bool)
	var uniqueSubs []models.Submission
	for _, sub := range subs {
		key := fmt.Sprintf("%s_%s", sub.CandidateID.Hex(), sub.AssessmentID.Hex())
		if !seen[key] {
			uniqueSubs = append(uniqueSubs, sub)
			seen[key] = true
		}
	}
	return uniqueSubs, nil
}

func (s *submissionService) GetOrGenerateQuestions(ctx context.Context, assessmentID, candidateID string) ([]models.Question, error) {
	aID, _ := primitive.ObjectIDFromHex(assessmentID)
	cID, _ := primitive.ObjectIDFromHex(candidateID)

	// 1. Check if submission already has generated questions
	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})
	if err == nil && len(submission.GeneratedQuestions) > 0 {
		return submission.GeneratedQuestions, nil
	}

	// 2. Fetch Assessment Rules
	assessment, err := s.assessmentRepo.FindByID(ctx, aID)
	if err != nil {
		return nil, errors.New("assessment not found")
	}

	// 3. Sample Questions based on Rules
	config, _ := s.qbRepo.GetBankConfig(ctx)

	var generatedQuestions []models.Question
	for _, rule := range assessment.QuestionRules {
		filter := bson.M{
			"category":   rule.Category,
			"difficulty": rule.Difficulty,
		}
		if rule.SubCategory != "" {
			filter["sub_category"] = rule.SubCategory
		}

		bankEntries, err := s.qbRepo.Sample(ctx, filter, rule.Count)
		if err != nil {
			return nil, fmt.Errorf("failed to sample questions: %v", err)
		}

		for _, entry := range bankEntries {
			// Resolve Audio URL: Rule > Bank Config > Question Entry
			finalAudio := rule.AudioURL
			if finalAudio == "" && config != nil {
				for _, c := range config.Categories {
					if c.Name == rule.Category {
						if rule.SubCategory == "" {
							// Check difficulty level in CategoryConfig
							for _, d := range c.Difficulties {
								if d.Difficulty == rule.Difficulty {
									finalAudio = d.AudioURL
									break
								}
							}
							if finalAudio == "" {
								finalAudio = c.AudioURL // Fallback to category level
							}
						} else {
							for _, su := range c.SubCategories {
								if su.Name == rule.SubCategory {
									// Check difficulty level in SubCategoryConfig
									for _, d := range su.Difficulties {
										if d.Difficulty == rule.Difficulty {
											finalAudio = d.AudioURL
											break
										}
									}
									if finalAudio == "" {
										finalAudio = su.AudioURL // Fallback to sub-category level
									}
									break
								}
							}
						}
						break
					}
				}
			}
			if finalAudio == "" {
				finalAudio = entry.AudioURL
			}

			generatedQuestions = append(generatedQuestions, models.Question{
				ID:            entry.ID,
				Text:          entry.Text,
				Type:          entry.Type,
				Options:       entry.Options,
				CorrectAnswer: entry.CorrectAnswer,
				Points:        rule.PointsPerQuestion,
				AudioURL:      finalAudio,
			})
		}
	}

	// 4. Save/Update Submission with Locked Questions
	if submission == nil {
		// Create placeholder submission to lock questions
		user, _ := s.userRepo.FindByID(ctx, cID)
		submission = &models.Submission{
			AssessmentID: aID,
			CandidateID:  cID,
			GeneratedQuestions: generatedQuestions,
			Status:       "in_progress",
			CreatedAt:    time.Now(),
			StartedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if user != nil {
			submission.CandidateName = user.Name
			submission.CandidateEmail = user.Email
			submission.CandidatePhone = user.Phone
		}
		_, err = s.repo.Create(ctx, submission)
	} else {
		submission.GeneratedQuestions = generatedQuestions
		if submission.StartedAt.IsZero() {
			submission.StartedAt = time.Now()
		}
		submission.UpdatedAt = time.Now()
		err = s.repo.Update(ctx, submission.ID, submission)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to save generated questions: %v", err)
	}

	return generatedQuestions, nil
}
