package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"hireit-backend/services"
	"hireit-backend/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type GoogleAuthController struct {
	authService services.AuthService
}

func NewGoogleAuthController(authService services.AuthService) *GoogleAuthController {
	return &GoogleAuthController{authService: authService}
}

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

func (ctrl *GoogleAuthController) GoogleLogin(c *gin.Context) {
	role := c.Query("role")
	if role == "" {
		role = "candidate"
	}
	url := getGoogleLoginConfig().AuthCodeURL(role, oauth2.AccessTypeOffline)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (ctrl *GoogleAuthController) GoogleLoginCallback(c *gin.Context) {
	code := c.Query("code")
	role := c.Query("state")
	if role == "" {
		role = "candidate"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	token, err := getGoogleLoginConfig().Exchange(ctx, code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange token"})
		return
	}

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

	dbCtx, dbCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer dbCancel()

	tokenString, userRole, isNew, err := ctrl.authService.GoogleLogin(dbCtx, userInfo.Email, userInfo.Name, role)
	if err != nil {
		if err.Error() == "role mismatch" {
			errorMsg := fmt.Sprintf("You have an existing account with a different role. Please sign in as %s.", role) // Simplification
			frontendURL := fmt.Sprintf("%s/login?error=role_mismatch&message=%s", os.Getenv("FRONTEND_URL"), errorMsg)
			c.Redirect(http.StatusTemporaryRedirect, frontendURL)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Authentication failed"})
		return
	}

	frontendURL := fmt.Sprintf("%s/google-callback?token=%s&role=%s", os.Getenv("FRONTEND_URL"), tokenString, userRole)
	if isNew {
		frontendURL += "&is_new_user=true"
	}

	c.Redirect(http.StatusTemporaryRedirect, frontendURL)
}
