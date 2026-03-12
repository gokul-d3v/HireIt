package controllers

import (
	"context"
	"net/http"
	"time"

	"hireit-backend/models"
	"hireit-backend/repositories"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type QuestionBankController struct {
	repo repositories.QuestionBankRepository
}

func NewQuestionBankController(repo repositories.QuestionBankRepository) *QuestionBankController {
	return &QuestionBankController{repo: repo}
}

// POST /api/admin/questions/import
func (ctrl *QuestionBankController) ImportQuestions(c *gin.Context) {
	var input struct {
		Questions []struct {
			Category      string   `json:"category"`
			SubCategory   string   `json:"sub_category"`
			Difficulty    string   `json:"difficulty"`
			Type          string   `json:"type"`
			Text          string   `json:"text"`
			Options       []string `json:"options"`
			CorrectAnswer string   `json:"correct_answer"`
		} `json:"questions"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	importedCount := 0
	for _, q := range input.Questions {
		entry := &models.QuestionBankEntry{
			ID:            primitive.NewObjectID(),
			Category:      q.Category,
			SubCategory:   q.SubCategory,
			Difficulty:    q.Difficulty,
			Type:          models.QuestionType(q.Type),
			Text:          q.Text,
			Options:       q.Options,
			CorrectAnswer: q.CorrectAnswer,
		}

		_, err := ctrl.repo.Create(ctx, entry)
		if err == nil {
			importedCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Questions imported successfully",
		"imported_count": importedCount,
	})
}
