package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Interview represents an interview slot or scheduled interview
type Interview struct {
	ID            primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	InterviewerID primitive.ObjectID  `bson:"interviewer_id" json:"interviewer_id"`
	CandidateID   *primitive.ObjectID `bson:"candidate_id,omitempty" json:"candidate_id,omitempty"`
	Title         string              `bson:"title" json:"title"`
	Description   string              `bson:"description" json:"description"`
	Type          string              `bson:"type" json:"type"` // Technical, HR, Behavioral, etc.
	ScheduledAt   time.Time           `bson:"scheduled_at" json:"scheduled_at"`
	Duration      int                 `bson:"duration" json:"duration"` // in minutes
	Status        string              `bson:"status" json:"status"`     // available, scheduled, confirmed, completed, cancelled
	MeetingLink   string              `bson:"meeting_link,omitempty" json:"meeting_link,omitempty"`
	Notes         string              `bson:"notes,omitempty" json:"notes,omitempty"`
	CreatedAt     time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time           `bson:"updated_at" json:"updated_at"`
}

// InterviewWithDetails includes populated user details
type InterviewWithDetails struct {
	Interview
	InterviewerName  string `json:"interviewer_name,omitempty"`
	CandidateName    string `json:"candidate_name,omitempty"`
	InterviewerEmail string `json:"interviewer_email,omitempty"`
	CandidateEmail   string `json:"candidate_email,omitempty"`
}

// CreateInterviewSlotRequest represents the request to create an interview slot
type CreateInterviewSlotRequest struct {
	Title       string    `json:"title" binding:"required"`
	Description string    `json:"description"`
	Type        string    `json:"type" binding:"required"`
	ScheduledAt time.Time `json:"scheduled_at" binding:"required"`
	Duration    int       `json:"duration" binding:"required,min=15,max=240"`
	MeetingLink string    `json:"meeting_link"`
}

// UpdateInterviewRequest represents the request to update an interview
type UpdateInterviewRequest struct {
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Type        string    `json:"type"`
	ScheduledAt time.Time `json:"scheduled_at"`
	Duration    int       `json:"duration"`
	MeetingLink string    `json:"meeting_link"`
	Notes       string    `json:"notes"`
}

// CompleteInterviewRequest represents the request to complete an interview
type CompleteInterviewRequest struct {
	Notes string `json:"notes"`
}
