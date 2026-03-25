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

type FaceSnapshots struct {
	InitialImage            string   `bson:"initial_image" json:"initial_image"`
	MiddleImage             string   `bson:"middle_image" json:"middle_image"`
	EndImage                string   `bson:"end_image" json:"end_image"`
	InitialVsMiddleDistance *float64 `bson:"initial_vs_middle_distance" json:"initial_vs_middle_distance"`
	InitialVsEndDistance    *float64 `bson:"initial_vs_end_distance" json:"initial_vs_end_distance"`
}

type Submission struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	AssessmentID   primitive.ObjectID `bson:"assessment_id" json:"assessment_id"`
	CandidateID    primitive.ObjectID `bson:"candidate_id" json:"candidate_id"`
	CandidateName  string             `bson:"candidate_name" json:"candidate_name"`
	CandidateEmail string             `bson:"candidate_email" json:"candidate_email"`
	CandidatePhone string             `bson:"candidate_phone" json:"candidate_phone"`
	Answers        []Answer           `bson:"answers" json:"answers"`
	Violations     []Violation        `bson:"violations,omitempty" json:"violations,omitempty"`
	FaceSnapshots  *FaceSnapshots     `bson:"face_snapshots,omitempty" json:"face_snapshots,omitempty"`
	Score          int                `bson:"score" json:"score"`   // Total score
	Status         string             `bson:"status" json:"status"` // "in_progress", "submitted", "graded"
	CreatedBy      primitive.ObjectID `bson:"created_by" json:"created_by"`
	CreatedAt      time.Time          `bson:"created_at" json:"created_at"`
	StartedAt      time.Time          `bson:"started_at" json:"started_at"`
	SubmittedAt    time.Time          `bson:"submitted_at,omitempty" json:"submitted_at,omitempty"`
	UpdatedAt      time.Time          `bson:"updated_at" json:"updated_at"`
	DeletedAt      *time.Time         `bson:"deleted_at,omitempty" json:"-"`

	// This stores the unique set of questions generated for this candidate's run
	GeneratedQuestions     []Question `bson:"generated_questions,omitempty" json:"generated_questions,omitempty"`
	QuestionSetGeneratedAt time.Time  `bson:"question_set_generated_at,omitempty" json:"question_set_generated_at,omitempty"`
	QuestionSetVersion     time.Time  `bson:"question_set_version,omitempty" json:"question_set_version,omitempty"`

	// Phase System
	Passed            bool                `bson:"passed" json:"passed"`
	IsDemo            bool                `bson:"is_demo" json:"is_demo"`
	NextPhaseUnlocked bool                `bson:"next_phase_unlocked" json:"next_phase_unlocked"`
	ShuffledOptions   map[string][]string `bson:"shuffled_options,omitempty" json:"shuffled_options,omitempty"` // question_id -> shuffled options
	MinPassingScore   int                 `bson:"min_passing_score" json:"min_passing_score"`
	TotalMarks        int                 `bson:"total_marks" json:"total_marks"`
}
