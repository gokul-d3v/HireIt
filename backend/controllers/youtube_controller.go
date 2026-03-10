package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
	"google.golang.org/api/youtube/v3"
)

type YouTubeController struct{}

func NewYouTubeController() *YouTubeController {
	return &YouTubeController{}
}

var youtubeOauthConfig *oauth2.Config

func getYouTubeOauthConfig() *oauth2.Config {
	if youtubeOauthConfig == nil {
		youtubeOauthConfig = &oauth2.Config{
			RedirectURL:  strings.TrimSpace(os.Getenv("YOUTUBE_REDIRECT_URL")), // e.g., http://localhost:8080/api/youtube/callback
			ClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
			ClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
			Scopes:       []string{"https://www.googleapis.com/auth/youtube.upload"},
			Endpoint:     google.Endpoint,
		}
	}
	return youtubeOauthConfig
}

// AuthYouTube initiates the OAuth2 flow
func (ctrl *YouTubeController) AuthYouTube(c *gin.Context) {
	config := getYouTubeOauthConfig()
	// AuthCodeURL with offline access gives us a refresh token
	url := config.AuthCodeURL("state-token", oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

// AuthYouTubeCallback handles the OAuth2 callback and saves the token
func (ctrl *YouTubeController) AuthYouTubeCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code not found in request"})
		return
	}

	config := getYouTubeOauthConfig()
	token, err := config.Exchange(context.Background(), code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to exchange token: %v", err)})
		return
	}

	// Save the token to a file
	err = saveToken("youtube_token.json", token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to save token: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "YouTube authentication successful! Token saved."})
}

func saveToken(path string, token *oauth2.Token) error {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(token)
}

func getYouTubeClient(ctx context.Context) (*http.Client, error) {
	b, err := os.ReadFile("youtube_token.json")
	if err != nil {
		return nil, fmt.Errorf("Warning: missing youtube_token.json (need to auth first): %v", err)
	}

	token := &oauth2.Token{}
	if err := json.Unmarshal(b, token); err != nil {
		return nil, err
	}

	config := getYouTubeOauthConfig()
	return config.Client(ctx, token), nil
}

// UploadEvidence receives a video file, uploads it to YouTube, and returns the URL.
func (ctrl *YouTubeController) UploadEvidence(c *gin.Context) {
	candidateID, _ := c.Get("userID")

	file, _, err := c.Request.FormFile("video")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get video file from request"})
		return
	}
	defer file.Close()

	ctx := context.Background()
	client, err := getYouTubeClient(ctx)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "YouTube client not authenticated. Admin must log in first."})
		return
	}

	service, err := youtube.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create YouTube client"})
		return
	}

	title := fmt.Sprintf("Malpractice Evidence - %s", time.Now().Format("20060102_150405"))
	var desc string
	if candidateID != nil {
		desc = fmt.Sprintf("Automated malpractice evidence upload from HireIt for Candidate ID: %v.", candidateID)
	} else {
		desc = "Automated malpractice evidence upload from HireIt."
	}

	upload := &youtube.Video{
		Snippet: &youtube.VideoSnippet{
			Title:       title,
			Description: desc,
			CategoryId:  "22", // People & Blogs
		},
		Status: &youtube.VideoStatus{
			PrivacyStatus: "unlisted",
		},
	}

	call := service.Videos.Insert([]string{"snippet", "status"}, upload)
	video, err := call.Media(file).Do()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to upload video to YouTube: %v", err)})
		return
	}

	videoURL := "https://youtu.be/" + video.Id

	c.JSON(http.StatusOK, gin.H{"url": videoURL})
}
