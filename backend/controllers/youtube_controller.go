package controllers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
	"google.golang.org/api/youtube/v3"
	"hireit-backend/repositories"
	"hireit-backend/services"
	"hireit-backend/utils"
	"io"
)

type YouTubeController struct {
	userRepo   repositories.UserRepository
	assessRepo repositories.AssessmentRepository
	subRepo    repositories.SubmissionRepository
}

func NewYouTubeController(userRepo repositories.UserRepository, assessRepo repositories.AssessmentRepository, subRepo repositories.SubmissionRepository) *YouTubeController {
	return &YouTubeController{
		userRepo:   userRepo,
		assessRepo: assessRepo,
		subRepo:    subRepo,
	}
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
	url := config.AuthCodeURL("state-token", oauth2.AccessTypeOffline)
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

// UploadEvidence receives a video file and offloads processing to a background worker pool.
func (ctrl *YouTubeController) UploadEvidence(c *gin.Context) {
	candidateIDPtr, _ := c.Get("userID")
	assessmentIDStr := c.Param("id")

	file, _, err := c.Request.FormFile("video")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get video file from request"})
		return
	}
	defer file.Close()

	// Capture video data before the request context ends
	videoBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read video file"})
		return
	}

	timestamp := c.PostForm("timestamp")
	utils.GetLogger().Infof("UploadEvidence Request: AID: %s, TS: %s", assessmentIDStr, timestamp)

	// Fetch Candidate and Assessment details for the background task
	ctx := context.Background()
	candidateName := "Unknown Candidate"
	assessmentTitle := "Unknown Assessment"

	candidateID := primitive.NilObjectID
	if candidateIDPtr != nil {
		if uid, ok := candidateIDPtr.(primitive.ObjectID); ok {
			candidateID = uid
			user, err := ctrl.userRepo.FindByID(ctx, uid)
			if err == nil {
				candidateName = user.Name
			}
		}
	}

	if assessmentIDStr != "" {
		aid, err := utils.ToObjectID(assessmentIDStr)
		if err == nil {
			assessment, err := ctrl.assessRepo.FindByID(ctx, aid)
			if err == nil {
				assessmentTitle = assessment.Title
			}
		}
	}

	// Generate a descriptive filename for the evidence (e.g., Joe_Doe_evidence.webm)
	safeCandidateName := strings.ReplaceAll(candidateName, " ", "_")
	filename := fmt.Sprintf("%s_evidence.webm", safeCandidateName)

	// Submit task to background worker pool
	utils.GetWorkerPool().Submit(func() {
		processUpload(ctrl, candidateID, candidateName, assessmentTitle, assessmentIDStr, filename, videoBytes, timestamp)
	})

	c.JSON(http.StatusAccepted, gin.H{
		"message": "Evidence upload initiated in background",
		"status":  "processing",
	})
}

// processUpload handles the background YouTube and Telegram upload logic
func processUpload(ctrl *YouTubeController, candidateID primitive.ObjectID, candidateName, assessmentTitle, assessmentIDStr, filename string, videoBytes []byte, timestamp string) {
	logger := utils.GetLogger()
	logger.Infof("Starting background process for %s, TS: %s", candidateName, timestamp)
	ctx := context.Background()
	var videoURL string

	// 1. Try YouTube Upload
	client, err := getYouTubeClient(ctx)
	if err != nil {
		logger.Warnf("YouTube Upload Skipped: %v", err)
	} else {
		service, err := youtube.NewService(ctx, option.WithHTTPClient(client))
		if err != nil {
			logger.Errorf("YouTube Service Error: %v", err)
		} else {
			title := fmt.Sprintf("Malpractice Evidence - %s", time.Now().Format("20060102_150405"))
			desc := fmt.Sprintf("Automated malpractice evidence upload from HireIt for Candidate: %s.", candidateName)

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
			video, err := call.Media(bytes.NewReader(videoBytes)).Do()
			if err != nil {
				logger.Errorf("YouTube Upload Failed: %v", err)
			} else {
				videoURL = "https://youtu.be/" + video.Id
				logger.Infof("YouTube Upload Success: %s", videoURL)
			}
		}
	}

	// 2. Send to Telegram (Crucial: ALWAYS try this if credentials exist)
	captionTitle := "🚨 Malpractice Detected!"
	if videoURL == "" {
		captionTitle = "🚨 Malpractice Detected (YouTube Failed)"
	}

	caption := fmt.Sprintf(
		"<b>%s</b>\n\n"+
			"<b>Candidate:</b> %s\n"+
			"<b>Assessment:</b> %s\n"+
			"<b>Assessment ID:</b> %s\n"+
			"<b>Date:</b> %s\n"+
			"<b>Time:</b> %s\n",
		captionTitle,
		candidateName,
		assessmentTitle,
		assessmentIDStr,
		time.Now().Format("2006-01-02"),
		time.Now().Format("15:04:05"),
	)

	if videoURL != "" {
		caption += fmt.Sprintf("\n<b>YouTube Link:</b> %s", videoURL)
	}

	logger.Infof("Attempting Telegram upload for %s", candidateName)
	tgFileID, err := services.SendTelegramVideo(videoBytes, filename, caption)
	if err != nil {
		logger.Errorf("Telegram Upload Error: %v", err)
	} else {
		logger.Infof("Telegram Upload Success (ID: %s) for %s", tgFileID, candidateName)
		// Prioritize Telegram Proxy for immediate playback in the dashboard
		if tgFileID != "" {
			videoURL = "/api/telegram/image/" + tgFileID
		}
	}

	// 3. Update Database with Video URL (YouTube or Telegram Proxy)
	if videoURL != "" && assessmentIDStr != "" && !candidateID.IsZero() && timestamp != "" {
		logger.Infof("Attempting DB update with URL: %s", videoURL)
		aid, err := utils.ToObjectID(assessmentIDStr)
		if err == nil {
			err = ctrl.subRepo.AddVideoEvidence(ctx, candidateID, aid, timestamp, videoURL)
			if err != nil {
				logger.Errorf("Database Update Error: %v", err)
			} else {
				logger.Infof("Database Update Success (%s) for %s", videoURL, candidateName)
			}
		}
	} else {
		logger.Warnf("DB Update Skipped. URL: %s, AID: %s, CID: %s, TS: %s", videoURL, assessmentIDStr, candidateID.Hex(), timestamp)
	}
}
