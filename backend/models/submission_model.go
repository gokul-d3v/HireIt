package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Answer struct {
	QuestionID primitive.ObjectID `bson:"question_id" json:"question_id"`
	Value      string             `bson:"value" json:"value"` // Selected option or text answer
	IsCorrect  bool               `bson:"is_correct" json:"is_correct"`
	Points     int                `bson:"points" json:"points"`
}

type Violation struct {
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
	Type      string    `bson:"type" json:"type"` // "multiple_people", "audio_anomaly", "tab_switch", etc.
	Reason    string    `bson:"reason" json:"reason"`
	Evidence  string    `bson:"evidence,omitempty" json:"evidence,omitempty"` // Optional base64 image or audio snippet
}

type Submission struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	AssessmentID primitive.ObjectID `bson:"assessment_id" json:"assessment_id"`
	CandidateID  primitive.ObjectID `bson:"candidate_id" json:"candidate_id"`
	CandidateName  string             `bson:"candidate_name" json:"candidate_name"`
	CandidateEmail string             `bson:"candidate_email" json:"candidate_email"`
	CandidatePhone string             `bson:"candidate_phone" json:"candidate_phone"`
	Answers      []Answer           `bson:"answers" json:"answers"`
	Violations   []Violation        `bson:"violations,omitempty" json:"violations,omitempty"`
	Score        int                `bson:"score" json:"score"`   // Total score
	Status       string             `bson:"status" json:"status"` // "in_progress", "submitted", "graded"
	CreatedBy    primitive.ObjectID `bson:"created_by" json:"created_by"`
	CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
	StartedAt    time.Time          `bson:"started_at" json:"started_at"`
	SubmittedAt  time.Time          `bson:"submitted_at,omitempty" json:"submitted_at,omitempty"`
	UpdatedAt    time.Time          `bson:"updated_at" json:"updated_at"`
	DeletedAt    *time.Time         `bson:"deleted_at,omitempty" json:"-"`

	// Phase System
	Passed            bool                `bson:"passed" json:"passed"`
	NextPhaseUnlocked bool                `bson:"next_phase_unlocked" json:"next_phase_unlocked"`
	ShuffledOptions   map[string][]string `bson:"shuffled_options,omitempty" json:"shuffled_options,omitempty"` // question_id -> shuffled options
}
