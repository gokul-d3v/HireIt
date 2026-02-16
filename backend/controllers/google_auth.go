package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"hireit-backend/models"
	"hireit-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var googleLoginConfig *oauth2.Config

func getGoogleLoginConfig() *oauth2.Config {
	if googleLoginConfig == nil {
		googleLoginConfig = &oauth2.Config{
			RedirectURL:  strings.TrimSpace(os.Getenv("GOOGLE_LOGIN_REDIRECT_URL")),
			ClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
			ClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
			Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
			Endpoint:     google.Endpoint,
		}
	}
	return googleLoginConfig
}

func GoogleLogin(c *gin.Context) {
	role := c.Query("role")
	if role == "" {
		role = "candidate"
	}
	// Use the role as the state token to persist it through the OAuth flow
	url := getGoogleLoginConfig().AuthCodeURL(role, oauth2.AccessTypeOffline)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func GoogleLoginCallback(c *gin.Context) {
	code := c.Query("code")
	role := c.Query("state") // Retrieve the role from the state parameter
	if role == "" {
		role = "candidate"
	}

	// Use context with timeout for token exchange
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	token, err := getGoogleLoginConfig().Exchange(ctx, code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange token"})
		return
	}

	// Fetch User Info using optimized HTTP client with timeout
	httpClient := utils.GetHTTPClient()
	reqCtx, reqCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer reqCancel()

	req, err := http.NewRequestWithContext(reqCtx, "GET", "https://www.googleapis.com/oauth2/v2/userinfo?access_token="+token.AccessToken, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info"})
		return
	}
	defer resp.Body.Close()

	var userInfo struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode user info"})
		return
	}

	// Check if user exists with timeout context
	dbCtx, dbCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer dbCancel()

	var user models.User
	err = UserCollection.FindOne(dbCtx, bson.M{"email": userInfo.Email}).Decode(&user)

	if err != nil {
		// Create new user if not exists
		user = models.User{
			ID:       primitive.NewObjectID(),
			Name:     userInfo.Name,
			Email:    userInfo.Email,
			Role:     role, // Use the role from state
			Password: "",   // No password for Google users
		}

		insertCtx, insertCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer insertCancel()

		_, err = UserCollection.InsertOne(insertCtx, user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}
	} else {
		// User exists - verify role matches
		if user.Role != role {
			// Role mismatch - redirect to login with error
			errorMsg := fmt.Sprintf("You have an existing %s account. Please sign in as %s.", user.Role, user.Role)
			frontendURL := fmt.Sprintf("%s/login?error=role_mismatch&message=%s", os.Getenv("FRONTEND_URL"), errorMsg)
			c.Redirect(http.StatusTemporaryRedirect, frontendURL)
			return
		}
	}

	// Generate JWT using pre-compiled key
	jwtToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID,
		"role": user.Role,
		"exp":  time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := jwtToken.SignedString(getJWTSecretKey())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Redirect to Frontend with Token
	frontendURL := fmt.Sprintf("%s/google-callback?token=%s&role=%s", os.Getenv("FRONTEND_URL"), tokenString, user.Role)

	// Add flag if user is new or has no password
	if user.Password == "" {
		frontendURL += "&is_new_user=true"
	}

	c.Redirect(http.StatusTemporaryRedirect, frontendURL)
}
