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
	Options       []string           `bson:"options,omitempty" json:"options,omitempty"` // For MCQ
	CorrectAnswer string             `bson:"correct_answer,omitempty" json:"correct_answer,omitempty"`
	Points        int                `bson:"points" json:"points" binding:"required"`
}

type Assessment struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Title       string             `bson:"title" json:"title" binding:"required"`
	Description string             `bson:"description" json:"description"`
	Duration    int                `bson:"duration" json:"duration"` // In minutes
	Questions   []Question         `bson:"questions" json:"questions"`
	CreatedBy   primitive.ObjectID `bson:"created_by" json:"created_by"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt   time.Time          `bson:"updated_at" json:"updated_at"`

	// Phase System
	Phase        int                 `bson:"phase" json:"phase"`                                     // 1, 2, or 3
	PassingScore int                 `bson:"passing_score" json:"passing_score"`                     // Minimum score to pass
	TotalMarks   int                 `bson:"total_marks" json:"total_marks"`                         // Sum of all question points
	NextPhaseID  *primitive.ObjectID `bson:"next_phase_id,omitempty" json:"next_phase_id,omitempty"` // Reference to next phase
}
