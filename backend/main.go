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
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	// MongoDB Connection with optimized pool settings
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
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

	var err error
	client, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		log.Fatal("Error connecting to MongoDB: ", err)
	}

	// Check the connection
	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Could not ping MongoDB: ", err)
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
		AllowOrigins:     []string{"http://localhost:3000", "https://hire-it.vercel.app"},
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

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

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
