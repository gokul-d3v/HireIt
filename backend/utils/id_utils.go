package utils

import (
	"errors"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ToObjectID converts a string ID to primitive.ObjectID
func ToObjectID(id string) (primitive.ObjectID, error) {
	if id == "" {
		return primitive.NilObjectID, errors.New("id is empty")
	}
	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, errors.New("invalid id format")
	}
	return objID, nil
}
