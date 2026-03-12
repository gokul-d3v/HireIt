package models

import (
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type QuestionBankEntry struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Category      string             `bson:"category" json:"category"`                           // "Programming", "Communication", "Aptitude"
	SubCategory   string             `bson:"sub_category,omitempty" json:"sub_category,omitempty"` // "Passage", "Grammar", "Listening" (or empty)
	Difficulty    string             `bson:"difficulty" json:"difficulty"`                       // "Easy", "Medium", "Hard"
	Text          string             `bson:"text" json:"text"`
	Type          QuestionType       `bson:"type" json:"type"`                                   // "MCQ", "CODING", "SUBJECTIVE"
	Options       []string           `bson:"options,omitempty" json:"options,omitempty"`
	CorrectAnswer string             `bson:"correct_answer,omitempty" json:"correct_answer,omitempty"`
}
