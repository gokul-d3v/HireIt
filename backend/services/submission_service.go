package services

import (
	"context"
	"errors"
	"fmt"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"hireit-backend/utils"
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
	SaveProgress(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation, currentQuestionIndex int) error
	GetSubmissionsByCandidate(ctx context.Context, candidateID string) ([]models.Submission, error)
	GetSubmissionsByInterviewer(ctx context.Context, interviewerID string) ([]models.Submission, error)
	GetOrGenerateQuestions(ctx context.Context, assessmentID, candidateID string) ([]models.Question, error)
}

type submissionService struct {
	repo           repositories.SubmissionRepository
	assessmentRepo repositories.AssessmentRepository
	userRepo       repositories.UserRepository
	qbRepo         repositories.QuestionBankRepository
	auditService   AuditLogService
}

func shouldReuseGeneratedQuestions(submission *models.Submission, assessment *models.Assessment) bool {
	if submission == nil || len(submission.GeneratedQuestions) == 0 {
		return false
	}

	questionSetVersion := submission.QuestionSetVersion
	if questionSetVersion.IsZero() {
		questionSetVersion = submission.QuestionSetGeneratedAt
	}
	if questionSetVersion.IsZero() {
		questionSetVersion = submission.CreatedAt
	}

	if assessment == nil || assessment.UpdatedAt.IsZero() || !assessment.UpdatedAt.After(questionSetVersion) {
		return true
	}

	// If the candidate has already started answering, keep the locked question set.
	if len(submission.Answers) > 0 || submission.Status == "completed" {
		return true
	}

	return false
}

func NewSubmissionService(repo repositories.SubmissionRepository, assessmentRepo repositories.AssessmentRepository, userRepo repositories.UserRepository, qbRepo repositories.QuestionBankRepository, auditService AuditLogService) SubmissionService {
	return &submissionService{
		repo:           repo,
		assessmentRepo: assessmentRepo,
		userRepo:       userRepo,
		qbRepo:         qbRepo,
		auditService:   auditService,
	}
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

func (s *submissionService) SaveProgress(ctx context.Context, assessmentID, candidateID string, answers []models.Answer, violations []models.Violation, currentQuestionIndex int) error {
	aID, _ := primitive.ObjectIDFromHex(assessmentID)
	cID, _ := primitive.ObjectIDFromHex(candidateID)

	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})
	if err != nil {
		// Fetch user and assessment details for denormalized submission
		user, _ := s.userRepo.FindByID(ctx, cID)
		
		// If user doesn't exist, they are a demo user. Do not store submissions in the database!
		if user == nil || user.IsDemo {
			return nil
		}

		assessment, _ := s.assessmentRepo.FindByID(ctx, aID)

		// Create new in-progress submission
		submission = &models.Submission{
			ID:           primitive.NewObjectID(),
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
		submission.CandidateName = user.Name
		submission.CandidateEmail = user.Email
		submission.CandidatePhone = user.Phone
		submission.IsDemo = user.IsDemo
		if assessment != nil {
			submission.MinPassingScore = assessment.PassingScore
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

	isDemo := false
	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})
	if err != nil {
		user, _ := s.userRepo.FindByID(ctx, cID)
		if user == nil || user.IsDemo {
			// Demo users do not generate submission documents ahead of time. Grade statelessly.
			isDemo = true
			submission = &models.Submission{
				ID:           primitive.NewObjectID(),
				AssessmentID: aID,
				CandidateID:  cID,
				CandidateName: "Demo User",
				CandidateEmail: "demo@demo.local",
				IsDemo:       true,
			}
		} else {
			s.auditService.RecordAction(ctx, cID, "", "SUBMIT_ASSESSMENT", "SUBMISSION", primitive.NilObjectID, "ERROR", "Submission doc not found", err.Error(), nil)
			return nil, errors.New("submission not found")
		}
	}

	// Use denormalized PassingScore if available, otherwise fetch assessment
	passingScore := submission.MinPassingScore
	var assessment *models.Assessment
	if passingScore == 0 || isDemo {
		var err error
		assessment, err = s.assessmentRepo.FindByID(ctx, aID)
		if err != nil {
			return nil, errors.New("assessment not found")
		}
		passingScore = assessment.PassingScore
		submission.TotalMarks = assessment.TotalMarks
	}

	// Calculate Score and Total Marks using the dynamically generated questions locked to this submission
	totalScore := 0
	totalMarks := 0
	questionMap := make(map[string]models.Question)

	if isDemo {
		totalMarks = submission.TotalMarks // Total marks initialized from assessment
		var qIDs []primitive.ObjectID
		for _, ans := range answers {
			qIDs = append(qIDs, ans.QuestionID)
		}
		if len(qIDs) > 0 {
			qbEntries, _ := s.qbRepo.Find(ctx, bson.M{"_id": bson.M{"$in": qIDs}}, options.Find())
			for _, qbe := range qbEntries {
				// Find matching rule to get points
				points := 0
				if assessment != nil {
					for _, rule := range assessment.QuestionRules {
						if rule.Category == qbe.Category && rule.Difficulty == qbe.Difficulty {
							if rule.SubCategory == "" || rule.SubCategory == qbe.SubCategory {
								points = rule.PointsPerQuestion
								break
							}
						}
					}
				}


				q := models.Question{
					ID:            qbe.ID,
					Text:          qbe.Text,
					Type:          qbe.Type,
					Options:       qbe.Options,
					CorrectAnswer: qbe.CorrectAnswer,
					Points:        points,
				}
				questionMap[q.ID.Hex()] = q
			}
		}
	} else {
		for _, q := range submission.GeneratedQuestions {
			questionMap[q.ID.Hex()] = q
			totalMarks += q.Points
		}
	}

	for i := range answers {
		q, ok := questionMap[answers[i].QuestionID.Hex()]
		if ok {
			isCorrect := false
			trimmedValue := strings.TrimSpace(answers[i].Value)
			trimmedCorrect := strings.TrimSpace(q.CorrectAnswer)

			if q.Type == models.MultipleChoice {
				if trimmedCorrect == trimmedValue {
					isCorrect = true
				} else if len(trimmedCorrect) == 1 && trimmedCorrect >= "A" && trimmedCorrect <= "Z" {
					// Fallback: check if the correct answer is a letter (A, B, C...) mapping to an option text
					optionIdx := int(trimmedCorrect[0] - 'A')
					if optionIdx >= 0 && optionIdx < len(q.Options) {
						if strings.TrimSpace(q.Options[optionIdx]) == trimmedValue {
							isCorrect = true
						}
					}
				}
			}

			if isCorrect {
				answers[i].IsCorrect = true
				answers[i].Points = q.Points
				totalScore += q.Points
			} else {
				answers[i].IsCorrect = false
				answers[i].Points = 0
			}
		}
	}

	passed := totalScore >= passingScore

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
		// Using context.Background() since this is a fire-and-forget background task
		go func(sub *models.Submission, snapshots *models.FaceSnapshots) {
			bgCtx := context.Background()
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
			// Using bgCtx to ensure update persists even if request context is cancelled
			_ = s.repo.Update(bgCtx, sub.ID, sub)
		}(submission, faceSnapshots)
	}

	submission.Score = totalScore
	submission.TotalMarks = totalMarks
	submission.Passed = passed
	submission.Status = "completed"
	submission.SubmittedAt = time.Now()
	submission.UpdatedAt = time.Now()

	if !isDemo {
		err = s.repo.Update(ctx, submission.ID, submission)
		if err != nil {
			utils.GetLogger().Errorf("[CRITICAL ERROR] SubmitAssessment update failed: %v", err)
			s.auditService.RecordAction(ctx, cID, submission.CandidateEmail, "SUBMIT_ASSESSMENT", "SUBMISSION", submission.ID, "ERROR", "Final DB update failed", err.Error(), nil)
		} else {
			s.auditService.RecordAction(ctx, cID, submission.CandidateEmail, "SUBMIT_ASSESSMENT", "SUBMISSION", submission.ID, "SUCCESS", "Assessment submitted successfully", "", nil)

			// Publish exam result to betExamResultQueue (fire-and-forget)
			totalMarks := submission.MinPassingScore // fallback
			if assessment, aErr := s.assessmentRepo.FindByID(ctx, aID); aErr == nil {
				totalMarks = assessment.TotalMarks
			}
			go func(mobile string, passed bool, marks, total int) {
				if err := PublishExamResult(mobile, passed, marks, total); err != nil {
					utils.GetLogger().Warnf("Failed to publish exam result to RabbitMQ: %v", err)
				} else {
					utils.GetLogger().Infof("Exam result published to betExamResultQueue: mobile=%s, result=%v, marks=%d/%d", mobile, passed, marks, total)
				}
			}(submission.CandidatePhone, passed, totalScore, totalMarks)
		}
	} else {
		s.auditService.RecordAction(ctx, cID, "demo@demo.local", "SUBMIT_ASSESSMENT", "SUBMISSION", primitive.NilObjectID, "SUCCESS", "Demo assessment scored successfully statelessly", "", nil)
	}
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

	// 2. Fetch submissions for these assessments (excluding demo/mock submissions)
	subs, err := s.repo.FindAll(ctx, bson.M{
		"assessment_id": bson.M{"$in": assessmentIDs},
		"is_demo":       bson.M{"$ne": true},
	}, options.Find().SetSort(bson.D{{Key: "submitted_at", Value: -1}}))
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

	// 1. Check if submission already exists
	submission, err := s.repo.FindOne(ctx, bson.M{"assessment_id": aID, "candidate_id": cID})

	// 2. Fetch assessment rules
	assessment, err := s.assessmentRepo.FindByID(ctx, aID)
	if err != nil {
		return nil, errors.New("assessment not found")
	}

	// Reuse the locked question set unless the assessment changed before the candidate started.
	if shouldReuseGeneratedQuestions(submission, assessment) {
		return submission.GeneratedQuestions, nil
	}

	// 3. Sample questions in the configured display order.
	generatedQuestions, err := sampleQuestionsForRules(ctx, s.qbRepo, assessment.QuestionRules)
	if err != nil {
		return nil, fmt.Errorf("failed to sample questions: %v", err)
	}

	// For demo users, return the generated questions statelessly without saving them
	user, _ := s.userRepo.FindByID(ctx, cID)
	if user == nil || user.IsDemo {
		return generatedQuestions, nil
	}

	// 4. Save/Update Submission with Locked Questions
	if submission == nil {
		// Create placeholder submission to lock questions
		submission = &models.Submission{
			AssessmentID:           aID,
			CandidateID:            cID,
			GeneratedQuestions:     generatedQuestions,
			QuestionSetGeneratedAt: time.Now(),
			QuestionSetVersion:     assessment.UpdatedAt,
			Status:                 "in_progress",
			CreatedAt:              time.Now(),
			UpdatedAt:              time.Now(),
		}
		submission.CandidateName = user.Name
		submission.CandidateEmail = user.Email
		submission.CandidatePhone = user.Phone
		submission.IsDemo = user.IsDemo
		if assessment != nil {
			submission.MinPassingScore = assessment.PassingScore
			submission.TotalMarks = assessment.TotalMarks
		}
		_, err = s.repo.Create(ctx, submission)
	} else {
		submission.GeneratedQuestions = generatedQuestions
		submission.QuestionSetGeneratedAt = time.Now()
		submission.QuestionSetVersion = assessment.UpdatedAt
		submission.UpdatedAt = time.Now()
		err = s.repo.Update(ctx, submission.ID, submission)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to save generated questions: %v", err)
	}

	return generatedQuestions, nil
}
