package services

import "hireit-backend/models"

func passageGroupKey(question models.Question) string {
	if question.PassageTitle == "" && question.PassageText == "" {
		return "question:" + question.ID.Hex()
	}

	return "passage:" + question.PassageTitle + "\x1f" + question.PassageText
}

func groupQuestionsByPassage(questions []models.Question) [][]models.Question {
	groups := make([][]models.Question, 0)
	groupIndexByKey := make(map[string]int)

	for _, question := range questions {
		key := passageGroupKey(question)
		if idx, exists := groupIndexByKey[key]; exists {
			groups[idx] = append(groups[idx], question)
			continue
		}

		groupIndexByKey[key] = len(groups)
		groups = append(groups, []models.Question{question})
	}

	return groups
}

func flattenQuestionGroups(groups [][]models.Question) []models.Question {
	totalQuestions := 0
	for _, group := range groups {
		totalQuestions += len(group)
	}

	flattened := make([]models.Question, 0, totalQuestions)
	for _, group := range groups {
		flattened = append(flattened, group...)
	}

	return flattened
}
