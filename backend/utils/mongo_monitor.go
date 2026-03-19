package utils

import (
	"context"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.mongodb.org/mongo-driver/event"
)

var (
	mongoCommandDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "mongodb_command_duration_seconds",
		Help:    "Duration of MongoDB commands.",
		Buckets: prometheus.DefBuckets,
	}, []string{"command", "collection"})

	mongoCommandErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "mongodb_command_errors_total",
		Help: "Total number of MongoDB command errors.",
	}, []string{"command", "collection"})
)

func NewMongoMonitor() *event.CommandMonitor {
	return &event.CommandMonitor{
		Started: func(ctx context.Context, evt *event.CommandStartedEvent) {
			// MongoDB commands like find, insert, update, delete usually have the collection name as the first element
		},
		Succeeded: func(ctx context.Context, evt *event.CommandSucceededEvent) {
			duration := float64(evt.DurationNanos) / float64(time.Second)
			command := evt.CommandName
			
			// Simple heuristics: most commands report their collection in the Succeeded event's context or similar
			// For simplicity in this dev/prod setup, we log by command name.
			mongoCommandDuration.WithLabelValues(command, "all").Observe(duration)
		},
		Failed: func(ctx context.Context, evt *event.CommandFailedEvent) {
			command := evt.CommandName
			mongoCommandErrors.WithLabelValues(command, "all").Inc()
		},
	}
}
