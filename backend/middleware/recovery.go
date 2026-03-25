package middleware

import (
	"fmt"
	"hireit-backend/utils"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

// RecoveryMiddleware catches panics, logs the stack trace, and returns a clean error response
func RecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				requestID, _ := c.Get("RequestID")
				logger := utils.GetLogger()

				// Log the panic with stack trace
				stackTrace := string(debug.Stack())
				logger.Errorf("[Panic Recovery][RequestID:%s] Panic: %v\nStack Trace:\n%s", 
					requestID, err, stackTrace)

				// Return a standardized 500 error
				utils.SendError(c, http.StatusInternalServerError, "An unexpected server error occurred", fmt.Errorf("%v", err))
				c.Abort()
			}
		}()
		c.Next()
	}
}
