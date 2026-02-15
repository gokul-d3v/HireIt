package middleware

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	jwtSecret     []byte
	jwtSecretOnce sync.Once
)

// getJWTSecret returns the cached JWT secret
func getJWTSecret() []byte {
	jwtSecretOnce.Do(func() {
		jwtSecret = []byte(os.Getenv("JWT_SECRET"))
	})
	return jwtSecret
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Remove "Bearer " prefix - optimized string operation
		if strings.HasPrefix(tokenString, "Bearer ") || strings.HasPrefix(tokenString, "bearer ") {
			tokenString = tokenString[7:]
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return getJWTSecret(), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if ok && token.Valid {
			// Convert sub (string) to ObjectID for easier use in controllers
			userIDStr, _ := claims["sub"].(string)
			userID, _ := primitive.ObjectIDFromHex(userIDStr)

			c.Set("userID", userID)
			c.Set("role", claims["role"])
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		c.Next()
	}
}
