package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AuditLog struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Action     string             `bson:"action" json:"action"`         // e.g., "CREATE_ASSESSMENT", "SUBMIT_ANSWERS"
	UserID     primitive.ObjectID `bson:"user_id" json:"user_id"`       // The user who performed the action
	UserEmail  string             `bson:"user_email" json:"user_email"` // Helpful for quick searching
	EntityType string             `bson:"entity_type" json:"entity_type"` // e.g., "ASSESSMENT", "SUBMISSION"
	EntityID   primitive.ObjectID `bson:"entity_id" json:"entity_id"`   // The target entity
	Status     string             `bson:"status" json:"status"`         // "SUCCESS" or "ERROR"
	Message    string             `bson:"message" json:"message"`       // Human-readable summary
	Error      string             `bson:"error,omitempty" json:"error,omitempty"` // Detailed error if any
	Metadata   map[string]interface{} `bson:"metadata,omitempty" json:"metadata,omitempty"` // Context (IP, UA, etc.)
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}
