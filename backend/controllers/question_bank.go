package controllers

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"hireit-backend/models"
	"hireit-backend/repositories"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type QuestionBankController struct {
	repo repositories.QuestionBankRepository
}

func normalizeCSVHeaderKey(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))

	var b strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}

	return b.String()
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
			PassageTitle  string   `json:"passage_title"`
			PassageText   string   `json:"passage_text"`
			Type          string   `json:"type"`
			Text          string   `json:"text"`
			Options       []string `json:"options"`
			CorrectAnswer string   `json:"correct_answer"`
			AudioURL      string   `json:"audio_url"`
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
			PassageTitle:  q.PassageTitle,
			PassageText:   q.PassageText,
			Type:          models.QuestionType(q.Type),
			Text:          q.Text,
			Options:       q.Options,
			CorrectAnswer: q.CorrectAnswer,
			AudioURL:      q.AudioURL,
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

// GET /api/admin/questions/config
// Returns distinct categories, sub_categories (grouped by category), and difficulties from the bank.
func (ctrl *QuestionBankController) GetConfig(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	all, err := ctrl.repo.Find(ctx, bson.M{}, options.Find())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load config"})
		return
	}

	categorySet := map[string]bool{}
	subCategoryMap := map[string]map[string]bool{} // category -> set of sub_categories
	difficultySet := map[string]bool{}

	for _, q := range all {
		categorySet[q.Category] = true
		difficultySet[q.Difficulty] = true
		if q.SubCategory != "" {
			if subCategoryMap[q.Category] == nil {
				subCategoryMap[q.Category] = map[string]bool{}
			}
			subCategoryMap[q.Category][q.SubCategory] = true
		}
	}

	categories := []string{}
	for k := range categorySet {
		categories = append(categories, k)
	}
	difficulties := []string{}
	for k := range difficultySet {
		difficulties = append(difficulties, k)
	}
	sort.Strings(categories)
	sort.Strings(difficulties)

	subCategories := map[string][]string{}
	for cat, subs := range subCategoryMap {
		list := []string{}
		for k := range subs {
			list = append(list, k)
		}
		sort.Strings(list)
		subCategories[cat] = list
	}

	structure, _ := ctrl.repo.GetBankConfig(ctx)

	c.JSON(http.StatusOK, gin.H{
		"categories":     categories,
		"sub_categories": subCategories,
		"difficulties":   difficulties,
		"structure":      structure,
	})
}

// POST /api/admin/questions/upload-csv
func (ctrl *QuestionBankController) UploadCSV(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Optional context from query params
	defaultCat := c.Query("category")
	defaultSub := c.Query("sub_category")
	defaultDiff := c.Query("difficulty")

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read CSV header"})
		return
	}

	// Simple column mapping (case-insensitive)
	colMap := make(map[string]int)
	for i, h := range header {
		colMap[normalizeCSVHeaderKey(h)] = i
	}

	_, hasText := colMap["text"]
	if !hasText {
		_, hasText = colMap["question"]
	}
	if !hasText {
		_, hasText = colMap["questiontext"]
	}
	if !hasText {
		// FALLBACK: Smart Parser for vertical list formats (single column or missing headers)
		ctrl.handleSmartUpload(c, reader, header, defaultCat, defaultSub, defaultDiff)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	importedCount := 0
	skippedCount := 0
	warnings := []string{}

	addWarning := func(format string, args ...any) {
		if len(warnings) >= 5 {
			return
		}
		warnings = append(warnings, fmt.Sprintf(format, args...))
	}

	val := func(row []string, keys ...string) string {
		for _, key := range keys {
			if idx, ok := colMap[normalizeCSVHeaderKey(key)]; ok && idx < len(row) {
				return strings.TrimSpace(row[idx])
			}
		}
		return ""
	}

	rowNumber := 1 // Header row
	for {
		row, err := reader.Read()
		rowNumber++
		if err == io.EOF {
			break
		}
		if err != nil {
			skippedCount++
			addWarning("Row %d skipped: %v", rowNumber, err)
			continue
		}

		cat := defaultCat
		if cat == "" {
			cat = val(row, "category", "cat")
		}
		sub := defaultSub
		if sub == "" {
			sub = val(row, "sub_category", "subcategory", "subcat", "subgroup")
		}
		diff := defaultDiff
		if diff == "" {
			diff = val(row, "difficulty", "level")
		}
		text := val(row, "text", "question", "question_text", "questiontext", "prompt")

		if text == "" {
			skippedCount++
			addWarning("Row %d skipped: missing question text", rowNumber)
			continue
		}
		if cat == "" || diff == "" {
			skippedCount++
			addWarning("Row %d skipped: missing category or difficulty", rowNumber)
			continue
		}

		options := []string{}
		if a := val(row, "option_a", "optiona", "a", "choice_a", "choicea", "option1"); a != "" {
			options = append(options, a)
		}
		if b := val(row, "option_b", "optionb", "b", "choice_b", "choiceb", "option2"); b != "" {
			options = append(options, b)
		}
		if c := val(row, "option_c", "optionc", "c", "choice_c", "choicec", "option3"); c != "" {
			options = append(options, c)
		}
		if d := val(row, "option_d", "optiond", "d", "choice_d", "choiced", "option4"); d != "" {
			options = append(options, d)
		}

		entry := &models.QuestionBankEntry{
			ID:            primitive.NewObjectID(),
			Category:      cat,
			SubCategory:   sub,
			Difficulty:    diff,
			PassageTitle:  val(row, "passage_title", "passagetitle", "passage_name", "passagename"),
			PassageText:   val(row, "passage_text", "passagetext", "passage", "reading_passage", "readingpassage"),
			Type:          models.QuestionType(strings.ToUpper(val(row, "type", "question_type", "questiontype"))),
			Text:          text,
			Options:       options,
			CorrectAnswer: val(row, "correct_answer", "correctanswer", "answer", "answer_key", "answerkey"),
		}

		if entry.Type == "" {
			entry.Type = models.MultipleChoice
		}

		_, err = ctrl.repo.Create(ctx, entry)
		if err == nil {
			importedCount++
		} else {
			skippedCount++
			addWarning("Row %d skipped: %v", rowNumber, err)
		}
	}

	response := gin.H{
		"message":        "CSV imported successfully",
		"imported_count": importedCount,
		"skipped_count":  skippedCount,
	}
	if len(warnings) > 0 {
		response["warnings"] = warnings
	}

	c.JSON(http.StatusOK, response)
}
func (ctrl *QuestionBankController) SaveStructure(c *gin.Context) {
	var input models.QuestionBankConfig
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ctrl.repo.SaveBankConfig(ctx, &input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save bank structure"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bank structure saved successfully"})
}

// GET /api/admin/questions
// Query params: category, sub_category, difficulty, page, limit
func (ctrl *QuestionBankController) ListQuestions(c *gin.Context) {
	filter := bson.M{}
	if cat := c.Query("category"); cat != "" {
		filter["category"] = cat
	}
	if sub := c.Query("sub_category"); sub != "" {
		filter["sub_category"] = sub
	}
	if diff := c.Query("difficulty"); diff != "" {
		filter["difficulty"] = diff
	}

	// Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	skip := int64((page - 1) * limit)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Total count for these filters
	total, _ := ctrl.repo.CountByFilter(ctx, filter)

	opts := options.Find().
		SetSort(bson.D{
			{Key: "category", Value: 1},
			{Key: "sub_category", Value: 1},
			{Key: "difficulty", Value: 1},
			{Key: "passage_title", Value: 1},
			{Key: "passage_text", Value: 1},
			{Key: "_id", Value: 1},
		}).
		SetSkip(skip).
		SetLimit(int64(limit))

	questions, err := ctrl.repo.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch questions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"questions": questions,
		"total":     total,
		"page":      page,
		"limit":     limit,
	})
}

// GET /api/admin/questions/count
// Query params: category, sub_category, difficulty — returns just the count for a slot
func (ctrl *QuestionBankController) CountQuestions(c *gin.Context) {
	filter := bson.M{}
	if cat := c.Query("category"); cat != "" {
		filter["category"] = cat
	}
	if sub := c.Query("sub_category"); sub != "" {
		filter["sub_category"] = sub
	} else {
		// Explicitly match empty (no sub_category) if not specified
		if c.Query("category") != "" && c.Query("sub_category") == "" {
			// Don't filter by sub_category – count all sub_categories
		}
	}
	if diff := c.Query("difficulty"); diff != "" {
		filter["difficulty"] = diff
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	count, err := ctrl.repo.CountByFilter(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count questions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"count": count})
}

// DELETE /api/admin/questions/:id
func (ctrl *QuestionBankController) DeleteQuestion(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid question ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ctrl.repo.DeleteByID(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete question"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Question deleted successfully"})
}

// DELETE /api/admin/questions
// Query params: category, sub_category, difficulty
func (ctrl *QuestionBankController) DeleteQuestionsByFilter(c *gin.Context) {
	category := strings.TrimSpace(c.Query("category"))
	difficulty := strings.TrimSpace(c.Query("difficulty"))
	subCategory := strings.TrimSpace(c.Query("sub_category"))

	if category == "" || difficulty == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "category and difficulty are required"})
		return
	}

	filter := bson.M{
		"category":   category,
		"difficulty": difficulty,
	}
	if subCategory != "" {
		filter["sub_category"] = subCategory
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	deletedCount, err := ctrl.repo.DeleteByFilter(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete questions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "Questions deleted successfully",
		"deleted_count": deletedCount,
	})
}

// PUT /api/admin/questions/:id
func (ctrl *QuestionBankController) UpdateQuestion(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid question ID"})
		return
	}

	var entry models.QuestionBankEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	entry.ID = id // Ensure ID matches the URL

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ctrl.repo.Update(ctx, id, &entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update question"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Question updated successfully"})
}

// POST /api/admin/audio-upload
func (ctrl *QuestionBankController) UploadAudio(c *gin.Context) {
	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Audio file is required"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".mp3": true, ".wav": true, ".ogg": true, ".m4a": true, ".aac": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported audio format. Allowed: mp3, wav, ogg, m4a, aac"})
		return
	}

	uploadDir := "./public/audio"
	// Double check dir exists (though main.go ensures it, good to have here too)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	savePath := filepath.Join(uploadDir, filename)

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read audio file"})
		return
	}
	if err := os.WriteFile(savePath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save audio file"})
		return
	}

	publicURL := fmt.Sprintf("/audio/%s", filename)
	fmt.Printf("[Audio Upload] Successfully saved %s to %s\n", filename, savePath)
	c.JSON(http.StatusOK, gin.H{"url": publicURL})
}

func (ctrl *QuestionBankController) handleSmartUpload(c *gin.Context, reader *csv.Reader, firstRow []string, defCat, defSub, defDiff string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var (
		currentText    []string
		currentOptions []string
		correctAnswer  string
		importedCount  int
		skippedCount   int
	)

	finalizeCurrent := func() {
		if len(currentText) == 0 {
			return
		}

		if defCat == "" || defDiff == "" {
			skippedCount++
			currentText = nil
			currentOptions = nil
			correctAnswer = ""
			return
		}

		entry := &models.QuestionBankEntry{
			ID:            primitive.NewObjectID(),
			Category:      defCat,
			SubCategory:   defSub,
			Difficulty:    defDiff,
			Type:          models.MultipleChoice,
			Text:          strings.Join(currentText, "\n"),
			Options:       currentOptions,
			CorrectAnswer: correctAnswer,
		}
		if _, err := ctrl.repo.Create(ctx, entry); err == nil {
			importedCount++
		} else {
			skippedCount++
		}

		currentText = nil
		currentOptions = nil
		correctAnswer = ""
	}

	processRow := func(row []string) {
		if len(row) == 0 {
			return
		}
		text := strings.TrimSpace(row[0])
		if text == "" {
			return
		}

		lower := strings.ToLower(text)

		// Detect Answer
		if strings.Contains(lower, "answer:") {
			parts := strings.Split(text, ":")
			if len(parts) > 1 {
				ans := strings.TrimSpace(parts[1])
				// Extract first letter/word (e.g., "B**" or "B")
				if len(ans) > 0 {
					correctAnswer = strings.ToUpper(string(ans[0]))
				}
			}
			// Finalize current question
			finalizeCurrent()
			return
		}

		// Detect Options (A), B), C), D) or A., B., etc.)
		isOption := false
		prefixes := []string{"A)", "B)", "C)", "D)", "A.", "B.", "C.", "D."}
		for _, p := range prefixes {
			if strings.HasPrefix(strings.ToUpper(text), p) {
				opt := strings.TrimSpace(text[len(p):])
				currentOptions = append(currentOptions, opt)
				isOption = true
				break
			}
		}

		if !isOption {
			currentText = append(currentText, text)
		}
	}

	// Process the "header" row because it's actually the first piece of data
	processRow(firstRow)

	// Process remainder
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		processRow(row)
	}

	// Flush the last pending question if the file doesn't end with an explicit answer row.
	finalizeCurrent()

	c.JSON(http.StatusOK, gin.H{
		"message":        "Smart CSV import completed",
		"imported_count": importedCount,
		"skipped_count":  skippedCount,
	})
}
