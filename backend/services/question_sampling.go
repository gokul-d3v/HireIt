package services

import (
	"context"
	"fmt"
	"math/rand"
	"sort"
	"time"

	"hireit-backend/models"
	"hireit-backend/repositories"

	"go.mongodb.org/mongo-driver/bson"
)

type indexedQuestionRule struct {
	index        int
	displayOrder int
	rule         models.QuestionRule
}

func effectiveDisplayOrder(rule models.QuestionRule, fallback int) int {
	if rule.DisplayOrder > 0 {
		return rule.DisplayOrder
	}

	return fallback
}

func sortQuestionRules(rules []models.QuestionRule) []models.QuestionRule {
	orderedRules := make([]indexedQuestionRule, 0, len(rules))
	for index, rule := range rules {
		orderedRules = append(orderedRules, indexedQuestionRule{
			index:        index,
			displayOrder: effectiveDisplayOrder(rule, index+1),
			rule:         rule,
		})
	}

	sort.SliceStable(orderedRules, func(i, j int) bool {
		if orderedRules[i].displayOrder == orderedRules[j].displayOrder {
			return orderedRules[i].index < orderedRules[j].index
		}

		return orderedRules[i].displayOrder < orderedRules[j].displayOrder
	})

	sortedRules := make([]models.QuestionRule, 0, len(rules))
	for _, orderedRule := range orderedRules {
		sortedRules = append(sortedRules, orderedRule.rule)
	}

	return sortedRules
}

func resolveQuestionAudioURL(config *models.QuestionBankConfig, rule models.QuestionRule, entry models.QuestionBankEntry) string {
	finalAudio := rule.AudioURL
	if finalAudio == "" && config != nil {
		for _, category := range config.Categories {
			if category.Name != rule.Category {
				continue
			}

			if rule.SubCategory == "" {
				for _, difficulty := range category.Difficulties {
					if difficulty.Difficulty == rule.Difficulty {
						finalAudio = difficulty.AudioURL
						break
					}
				}

				if finalAudio == "" {
					finalAudio = category.AudioURL
				}

				break
			}

			for _, subCategory := range category.SubCategories {
				if subCategory.Name != rule.SubCategory {
					continue
				}

				for _, difficulty := range subCategory.Difficulties {
					if difficulty.Difficulty == rule.Difficulty {
						finalAudio = difficulty.AudioURL
						break
					}
				}

				if finalAudio == "" {
					finalAudio = subCategory.AudioURL
				}

				break
			}

			break
		}
	}

	if finalAudio != "" {
		return finalAudio
	}

	return entry.AudioURL
}

func sampleQuestionsForRules(ctx context.Context, qbRepo repositories.QuestionBankRepository, rules []models.QuestionRule) ([]models.Question, error) {
	config, _ := qbRepo.GetBankConfig(ctx)
	orderedRules := sortQuestionRules(rules)
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	type categoryBucket struct {
		groups [][]models.Question
	}

	buckets := make([]categoryBucket, 0)
	bucketIndexByKey := make(map[string]int)

	allQuestions := make([]models.Question, 0)

	for index, rule := range orderedRules {
		filter := bson.M{
			"category":   rule.Category,
			"difficulty": rule.Difficulty,
		}
		if rule.SubCategory != "" {
			filter["sub_category"] = rule.SubCategory
		}

		bankEntries, err := qbRepo.Sample(ctx, filter, rule.Count)
		if err != nil {
			return nil, err
		}

		ruleQuestions := make([]models.Question, 0, len(bankEntries))
		for _, entry := range bankEntries {
			ruleQuestions = append(ruleQuestions, models.Question{
				ID:            entry.ID,
				Text:          entry.Text,
				Type:          entry.Type,
				PassageTitle:  entry.PassageTitle,
				PassageText:   entry.PassageText,
				Options:       entry.Options,
				CorrectAnswer: entry.CorrectAnswer,
				Points:        rule.PointsPerQuestion,
				AudioURL:      resolveQuestionAudioURL(config, rule, entry),
			})
		}

		displayOrder := effectiveDisplayOrder(rule, index+1)
		bucketKey := fmt.Sprintf("%04d:%s", displayOrder, rule.Category)
		groupedQuestions := groupQuestionsByPassage(ruleQuestions)

		if bucketIndex, exists := bucketIndexByKey[bucketKey]; exists {
			buckets[bucketIndex].groups = append(buckets[bucketIndex].groups, groupedQuestions...)
			continue
		}

		bucketIndexByKey[bucketKey] = len(buckets)
		buckets = append(buckets, categoryBucket{groups: groupedQuestions})
	}

	for _, bucket := range buckets {
		rng.Shuffle(len(bucket.groups), func(i, j int) {
			bucket.groups[i], bucket.groups[j] = bucket.groups[j], bucket.groups[i]
		})
		allQuestions = append(allQuestions, flattenQuestionGroups(bucket.groups)...)
	}

	return allQuestions, nil
}
