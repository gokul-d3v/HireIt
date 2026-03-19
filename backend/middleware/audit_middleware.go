package middleware

import (
	"hireit-backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func AuditMiddleware(auditService services.AuditLogService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Process request first
		c.Next()

		// Only log mutation methods or errors
		method := c.Request.Method
		status := c.Writer.Status()
		
		if method == http.MethodPost || method == http.MethodPut || method == http.MethodDelete || status >= 400 {
			userID, exists := c.Get("userID")
			uID := primitive.NilObjectID
			if exists {
				uID = userID.(primitive.ObjectID)
			}

			action := method + " " + c.Request.URL.Path
			logStatus := "SUCCESS"
			if status >= 400 {
				logStatus = "ERROR"
			}

			// We don't have the user email here easily without a DB lookup, 
			// but we can record the ID and metadata for now.
			metadata := map[string]interface{}{
				"ip":         c.ClientIP(),
				"user_agent": c.Request.UserAgent(),
				"status":     status,
			}

			// Record the log asynchronously
			go func() {
				_ = auditService.RecordAction(
					c.Request.Context(),
					uID,
					"", // Email can be populated by a separate background worker or joined in UI
					action,
					"API_REQUEST",
					primitive.NilObjectID,
					logStatus,
					"API Request completed with status " + http.StatusText(status),
					"", // Detailed error might be captured from context if set
					metadata,
				)
			}()
		}
	}
}
