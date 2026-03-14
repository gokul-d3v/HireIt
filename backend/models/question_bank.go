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
	Type          QuestionType       `bson:"type" json:"type"` // "MCQ", "CODING", "SUBJECTIVE"
	Options       []string           `bson:"options,omitempty" json:"options,omitempty"`
	CorrectAnswer string             `bson:"correct_answer,omitempty" json:"correct_answer,omitempty"`
	AudioURL      string             `bson:"audio_url,omitempty" json:"audio_url,omitempty"` // For Listening questions
}

type DifficultyConfig struct {
	Difficulty string `bson:"difficulty" json:"difficulty"`
	AudioURL   string `bson:"audio_url,omitempty" json:"audio_url,omitempty"`
}

type SubCategoryConfig struct {
	Name         string             `bson:"name" json:"name"`
	Difficulties []DifficultyConfig `bson:"difficulties" json:"difficulties"`
	AudioURL     string             `bson:"audio_url,omitempty" json:"audio_url,omitempty"` // Default/Fallback
}

type CategoryConfig struct {
	Name             string             `bson:"name" json:"name"`
	HasSubCategories bool               `bson:"has_sub_categories" json:"has_sub_categories"`
	SubCategories    []SubCategoryConfig `bson:"sub_categories" json:"sub_categories"`
	Difficulties     []DifficultyConfig `bson:"difficulties" json:"difficulties"` // Used if HasSubCategories is false
	AudioURL         string             `bson:"audio_url,omitempty" json:"audio_url,omitempty"` // Default/Fallback
	Expanded         bool               `bson:"expanded" json:"expanded"`
}


type QuestionBankConfig struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Categories []CategoryConfig   `bson:"categories" json:"categories"`
}
