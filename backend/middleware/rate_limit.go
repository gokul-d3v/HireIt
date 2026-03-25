package middleware

import (
	"hireit-backend/utils"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// IPLimiter holds the rate limiter for a specific IP
type IPLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

var (
	limiters = make(map[string]*IPLimiter)
	mu       sync.Mutex
)

func init() {
	// Cleanup old limiters every hour to prevent memory leaks
	go func() {
		for {
			time.Sleep(time.Hour)
			mu.Lock()
			for ip, l := range limiters {
				if time.Since(l.lastSeen) > 24*time.Hour {
					delete(limiters, ip)
				}
			}
			mu.Unlock()
		}
	}()
}

// getLimiter returns the rate limiter for the provided IP
func getLimiter(ip string) *rate.Limiter {
	mu.Lock()
	defer mu.Unlock()

	l, exists := limiters[ip]
	if !exists {
		// 60 requests per minute = 1 request per second
		// Burst of 100
		limiter := rate.NewLimiter(rate.Limit(1), 100)
		limiters[ip] = &IPLimiter{
			limiter:  limiter,
			lastSeen: time.Now(),
		}
		return limiter
	}

	l.lastSeen = time.Now()
	return l.limiter
}

// RateLimitMiddleware applies a per-IP rate limit
func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip, _, err := net.SplitHostPort(c.Request.RemoteAddr)
		if err != nil {
			ip = c.Request.RemoteAddr
		}

		limiter := getLimiter(ip)
		if !limiter.Allow() {
			utils.SendError(c, http.StatusTooManyRequests, "Too many requests. Please slow down.", nil)
			c.Abort()
			return
		}

		c.Next()
	}
}
