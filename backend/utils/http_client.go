package utils

import (
	"net/http"
	"sync"
	"time"
)

var (
	httpClient     *http.Client
	httpClientOnce sync.Once
)

// GetHTTPClient returns a singleton HTTP client optimized for performance
// with connection pooling and reuse
func GetHTTPClient() *http.Client {
	httpClientOnce.Do(func() {
		httpClient = &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				MaxConnsPerHost:     10,
				IdleConnTimeout:     90 * time.Second,
				DisableCompression:  false,
				DisableKeepAlives:   false,
			},
		}
	})
	return httpClient
}
