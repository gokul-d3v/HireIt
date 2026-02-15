package controllers

import (
	"context"
	"net/http"
	"os"
	"time"

	"broassess-backend/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

var googleOauthConfig *oauth2.Config

func init() {
	// Initialize OAuth config - ensure these are set in .env or passed correctly
	// Note: Creating config here relies on environment variables being loaded in main.go
}

func getOauthConfig() *oauth2.Config {
	if googleOauthConfig == nil {
		googleOauthConfig = &oauth2.Config{
			RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
			Scopes:       []string{calendar.CalendarEventsScope},
			Endpoint:     google.Endpoint,
		}
	}
	return googleOauthConfig
}

// AuthGoogle redirects user to Google for authentication
func AuthGoogle(c *gin.Context) {
	url := getOauthConfig().AuthCodeURL("state-token", oauth2.AccessTypeOffline)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

// AuthGoogleCallback handles the callback from Google
func AuthGoogleCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code not found"})
		return
	}

	// Use context with timeout for token exchange
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	token, err := getOauthConfig().Exchange(ctx, code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange token"})
		return
	}

	// In a real app, save this token to the database associated with the logged-in user
	// For now, we'll just return it or set a cookie
	// simpler: save to a global variable or file for demo purposes (NOT enabling multi-user yet)

	// Create a client using optimized HTTP client
	httpClient := utils.GetHTTPClient()
	oauthClient := getOauthConfig().Client(ctx, token)

	// Combine transports for better performance
	oauthClient.Transport = &oauth2.Transport{
		Source: getOauthConfig().TokenSource(ctx, token),
		Base:   httpClient.Transport,
	}

	calendarCtx, calendarCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer calendarCancel()

	srv, err := calendar.NewService(calendarCtx, option.WithHTTPClient(oauthClient))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create calendar service"})
		return
	}

	// List events to verify
	t := "primary"
	events, err := srv.Events.List(t).ShowDeleted(false).SingleEvents(true).MaxResults(10).Do()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to retrieve next 10 of the user's events"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Successfully authenticated with Google Calendar", "events": events.Items})
}

// ScheduleMeeting creates a meeting
func ScheduleMeeting(c *gin.Context) {
	// improved implementation would retrieve the token from DB for the user
	// For now, this endpoint assumes we have a way to get the client (e.g. stored token)
	c.JSON(http.StatusNotImplemented, gin.H{"message": "Meeting scheduling not fully implemented without persistence"})
}
