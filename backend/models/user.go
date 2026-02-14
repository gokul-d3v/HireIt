package models

import (
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email    string             `bson:"email" json:"email" binding:"required,email"`
	Password string             `bson:"password" json:"password" binding:"required,min=6"`
	Role     string             `bson:"role" json:"role" binding:"required,oneof=candidate interviewer admin"`
}
