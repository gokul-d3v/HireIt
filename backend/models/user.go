package models

import (
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name     string             `bson:"name" json:"name" binding:"required"`
	Email    string             `bson:"email" json:"email" binding:"required,email"`
	Phone    string             `bson:"phone" json:"phone"`
	Password string             `bson:"password" json:"password"` // Removed required binding for Google Auth
	Role     string             `bson:"role" json:"role" binding:"required,oneof=candidate interviewer admin"`
}
