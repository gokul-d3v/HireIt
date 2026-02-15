package main

// Trigger rebuild to load new env
import (
	"context"
	"fmt"
	"hireit-backend/controllers"
	"hireit-backend/routes"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var client *mongo.Client

func main() {
	log.Println("Starting HireIt Backend...")

	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found (expected in production)")
	}

	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
		log.Println("WARNING: PORT env var not set, defaulting to 8080")
	} else {
		log.Printf("PORT env var detected: %s", port)
	}

	// MongoDB Connection with optimized pool settings
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		log.Println("WARNING: MONGO_URI env var not set! Defaulting to localhost (will fail in production).")
		mongoURI = "mongodb://localhost:27017"
	} else {
		log.Println("MONGO_URI env var detected.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Configure connection pool for optimal performance
	clientOptions := options.Client().
		ApplyURI(mongoURI).
		SetMaxPoolSize(100).                 // Maximum connections in pool
		SetMinPoolSize(10).                  // Minimum connections to maintain
		SetMaxConnIdleTime(3 * time.Minute). // Close idle connections after 3 minutes
		SetServerSelectionTimeout(5 * time.Second)

	log.Println("Connecting to MongoDB...")
	var err error
	client, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		log.Fatal("FATAL: Error connecting to MongoDB: ", err)
	}

	// Check the connection
	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatal("FATAL: Could not ping MongoDB: ", err)
	}
	fmt.Println("Connected to MongoDB!")

	// Initialize Collections
	userCollection := client.Database("broassess").Collection("users")
	assessmentCollection := client.Database("broassess").Collection("assessments")
	submissionCollection := client.Database("broassess").Collection("submissions")
	interviewCollection := client.Database("broassess").Collection("interviews")

	controllers.InitAuthController(userCollection)
	controllers.InitAssessmentController(assessmentCollection)
	controllers.InitSubmissionController(submissionCollection)
	controllers.InitInterviewController(interviewCollection)

	// Initialize Router with custom middleware for better performance
	router := gin.New()
	router.Use(gin.Recovery()) // Only recovery middleware, no default logger

	// CORS Configuration
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "https://hire-it.vercel.app", "https://hireit-nine.vercel.app"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Setup Routes
	routes.SetupRoutes(router)

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "HireIt Backend Running",
		})
	})

	// Create HTTP server with timeouts to prevent slow client attacks
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine for graceful shutdown
	go func() {
		fmt.Printf("Server running on port %s\n", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("Shutting down server...")

	// Give outstanding requests 5 seconds to complete
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal("Server forced to shutdown: ", err)
	}

	// Disconnect MongoDB
	if err := client.Disconnect(shutdownCtx); err != nil {
		log.Fatal("Error disconnecting from MongoDB: ", err)
	}

	fmt.Println("Server exited gracefully")
}
