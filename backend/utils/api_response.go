package utils

import (
	"os"

	"github.com/gin-gonic/gin"
)

// APIResponse is the standard JSON response format
type APIResponse struct {
	Success   bool        `json:"success"`
	Message   string      `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
	RequestID string      `json:"request_id,omitempty"`
}

// SendSuccess sends a successful JSON response
func SendSuccess(c *gin.Context, status int, message string, data interface{}) {
	requestID, _ := c.Get("RequestID")
	c.JSON(status, APIResponse{
		Success:   true,
		Message:   message,
		Data:      data,
		RequestID: requestID.(string),
	})
}

// SendError sends a standardized error response and logs the internal error
func SendError(c *gin.Context, status int, userMessage string, internalErr error) {
	requestIDInterface, _ := c.Get("RequestID")
	requestID := ""
	if requestIDInterface != nil {
		requestID = requestIDInterface.(string)
	}

	logger := GetLogger()
	if internalErr != nil {
		logger.Errorf("[RequestID:%s] %s | Internal Error: %v", requestID, userMessage, internalErr)
	} else {
		logger.Warnf("[RequestID:%s] %s", requestID, userMessage)
	}

	// Never expose internalErr.Error() to the user if it's a 500
	displayError := userMessage
	if status >= 500 && os.Getenv("APP_ENV") == "production" {
		displayError = "An internal server error occurred. Please contact support."
	}

	c.JSON(status, APIResponse{
		Success:   false,
		Error:     displayError,
		RequestID: requestID,
	})
}
