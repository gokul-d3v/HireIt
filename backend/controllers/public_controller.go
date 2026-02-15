package controllers

import (
	"broassess-backend/models"
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// StartPublicAssessment handles guest login/signup for taking a test
func StartPublicAssessment(c *gin.Context) {
	var input struct {
		Name         string `json:"name" binding:"required"`
		Email        string `json:"email" binding:"required,email"`
		Phone        string `json:"phone"`
		AssessmentID string `json:"assessment_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Check if user exists
	var user models.User
	err := UserCollection.FindOne(ctx, bson.M{"email": input.Email}).Decode(&user)

	if err != nil {
		// User does not exist, create new one
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("candidate123"), 10) // Dummy password

		newUser := models.User{
			ID:       primitive.NewObjectID(),
			Name:     input.Name,
			Email:    input.Email,
			Phone:    input.Phone,
			Password: string(hashedPassword),
			Role:     "candidate",
		}

		_, err := UserCollection.InsertOne(ctx, newUser)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create candidate profile"})
			return
		}
		user = newUser
	}

	// 2. Generate Token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID,
		"role": user.Role,
		"exp":  time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := token.SignedString(getJWTSecretKey())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate access token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}
