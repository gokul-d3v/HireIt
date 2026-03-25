package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type QuestionType string

const (
	MultipleChoice QuestionType = "MCQ"
	Coding         QuestionType = "CODING"
	Subjective     QuestionType = "SUBJECTIVE"
)

type Question struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Text          string             `bson:"text" json:"text" binding:"required"`
	Type          QuestionType       `bson:"type" json:"type" binding:"required"`
	PassageTitle  string             `bson:"passage_title,omitempty" json:"passage_title,omitempty"`
	PassageText   string             `bson:"passage_text,omitempty" json:"passage_text,omitempty"`
	Options       []string           `bson:"options,omitempty" json:"options,omitempty"` // For MCQ
	CorrectAnswer string             `bson:"correct_answer,omitempty" json:"correct_answer,omitempty"`
	Points        int                `bson:"points" json:"points" binding:"required"`
	AudioURL      string             `bson:"audio_url,omitempty" json:"audio_url,omitempty"` // For Listening questions
}

type QuestionRule struct {
	Category          string `bson:"category" json:"category" binding:"required"`
	SubCategory       string `bson:"sub_category,omitempty" json:"sub_category,omitempty"`
	Difficulty        string `bson:"difficulty" json:"difficulty" binding:"required"`
	Count             int    `bson:"count" json:"count" binding:"required"`
	PointsPerQuestion int    `bson:"points_per_question" json:"points_per_question" binding:"required"`
	DisplayOrder      int    `bson:"display_order,omitempty" json:"display_order,omitempty"`
	AudioURL          string `bson:"audio_url,omitempty" json:"audio_url,omitempty"`
}

type Assessment struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Title         string             `bson:"title" json:"title" binding:"required"`
	Description   string             `bson:"description" json:"description"`
	Duration      int                `bson:"duration" json:"duration"` // In minutes
	IsMock        bool               `bson:"is_mock" json:"is_mock"`
	QuestionRules []QuestionRule     `bson:"question_rules" json:"question_rules"`
	Questions     []Question         `json:"questions,omitempty" bson:"-"` // Virtual field for API response
	CreatedBy     primitive.ObjectID `bson:"created_by" json:"created_by"`
	CreatedAt     time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updated_at"`

	PassingScore  int        `bson:"passing_score" json:"passing_score"` // Minimum score to pass
	TotalMarks    int        `bson:"total_marks" json:"total_marks"`     // Sum of all question points
	DeletedAt     *time.Time `bson:"deleted_at,omitempty" json:"-"`      // For soft delete
	QuestionCount int        `bson:"-" json:"question_count"`             // Computed: sum of rule counts
}
