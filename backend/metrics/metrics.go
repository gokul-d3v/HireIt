package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// HttpRequestsTotal tracks the total number of HTTP requests
	HttpRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests.",
	}, []string{"method", "endpoint", "status"})

	// HttpRequestDuration tracks the duration of HTTP requests
	HttpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "Duration of HTTP requests.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "endpoint"})

	// ActiveUsersGauge tracks the current number of active users
	ActiveUsersGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "hireit_active_users",
		Help: "Current number of active users (seen in the last 5 minutes).",
	})
)

// UpdateActiveUsers updates the active users gauge
func UpdateActiveUsers(count float64) {
	ActiveUsersGauge.Set(count)
}
