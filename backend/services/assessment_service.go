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

	// Security: If not interviewer, exclude questions from list view
	if role != "interviewer" {
		opts.SetProjection(bson.M{"question_rules": 0})
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

func (s *assessmentService) SampleQuestions(ctx context.Context, rules []models.QuestionRule) ([]models.Question, error) {
	// Fetch Bank Structure for audio fallback
	config, _ := s.qbRepo.GetBankConfig(ctx)

	var allQuestions []models.Question

	for _, rule := range rules {
		filter := bson.M{
			"category":   rule.Category,
			"difficulty": rule.Difficulty,
		}
		if rule.SubCategory != "" {
			filter["sub_category"] = rule.SubCategory
		}

		bankEntries, err := s.qbRepo.Sample(ctx, filter, rule.Count)
		if err != nil {
			return nil, err
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

			q := models.Question{
				ID:            entry.ID,
				Text:          entry.Text,
				Type:          entry.Type,
				PassageTitle:  entry.PassageTitle,
				PassageText:   entry.PassageText,
				Options:       entry.Options,
				CorrectAnswer: entry.CorrectAnswer,
				Points:        rule.PointsPerQuestion,
				AudioURL:      finalAudio,
			}
			allQuestions = append(allQuestions, q)
		}
	}

	return flattenQuestionGroups(groupQuestionsByPassage(allQuestions)), nil
}
