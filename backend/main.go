package main

// Trigger rebuild to load new env
import (
	"context"
	"hireit-backend/controllers"
	"hireit-backend/repositories"
	"hireit-backend/routes"
	"hireit-backend/services"
	"hireit-backend/utils"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var client *mongo.Client

func main() {
	utils.InitLogger()
	logger := utils.GetLogger()
	logger.Info("Starting HireIt Backend...")

	// Load .env file
	if err := godotenv.Load(); err != nil {
		logger.Warn("No .env file found (expected in production)")
	}

	cwd, _ := os.Getwd()
	logger.Infof("Server CWD: %s", cwd)

	// Ensure static directories exist
	if err := os.MkdirAll("./public/audio", 0755); err != nil {
		logger.Errorf("Failed to create public/audio directory: %v", err)
	}

	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
		logger.Warn("PORT env var not set, defaulting to 8080")
	} else {
		logger.Infof("PORT env var detected: %s", port)
	}

	// MongoDB Connection with optimized pool settings
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		logger.Warn("MONGO_URI env var not set! Defaulting to localhost (will fail in production).")
		mongoURI = "mongodb://localhost:27017"
	} else {
		logger.Info("MONGO_URI env var detected.")
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

	logger.Info("Connecting to MongoDB...")
	var err error
	client, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		logger.Fatalf("FATAL: Error connecting to MongoDB: %v", err)
	}

	// Check the connection
	err = client.Ping(ctx, nil)
	if err != nil {
		logger.Fatalf("FATAL: Could not ping MongoDB: %v", err)
	}
	logger.Info("Connected to MongoDB!")

	// Initialize Collections
	userCollection := client.Database("broassess").Collection("users")
	assessmentCollection := client.Database("broassess").Collection("assessments")
	submissionCollection := client.Database("broassess").Collection("submissions")
	interviewCollection := client.Database("broassess").Collection("interviews")
	questionBankCollection := client.Database("broassess").Collection("question_bank")
	questionBankConfigCollection := client.Database("broassess").Collection("question_bank_config")

	// Create Indexes
	_, _ = submissionCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "assessment_id", Value: 1}, {Key: "candidate_id", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	// Initialize Repositories
	userRepo := repositories.NewUserRepository(userCollection)
	assessRepo := repositories.NewAssessmentRepository(assessmentCollection)
	subRepo := repositories.NewSubmissionRepository(submissionCollection)
	interviewRepo := repositories.NewInterviewRepository(interviewCollection)
	qbRepo := repositories.NewQuestionBankRepository(questionBankCollection, questionBankConfigCollection)

	// Initialize Services
	authService := services.NewAuthService(userRepo)
	assessService := services.NewAssessmentService(assessRepo, qbRepo)
	submissionService := services.NewSubmissionService(subRepo, assessRepo, userRepo, qbRepo)
	interviewService := services.NewInterviewService(interviewRepo)

	// Initialize Controllers
	authCtrl := controllers.NewAuthController(authService)
	googleCtrl := controllers.NewGoogleAuthController(authService)
	youtubeCtrl := controllers.NewYouTubeController(userRepo, assessRepo, subRepo)
	publicCtrl := controllers.NewPublicController(authService)
	assessCtrl := controllers.NewAssessmentController(assessService, submissionService)
	interviewCtrl := controllers.NewInterviewController(interviewService)
	teleProxyCtrl := controllers.NewTelegramProxyController()
	questionBankController := controllers.NewQuestionBankController(qbRepo) // Initialize QuestionBankController

	// Initialize Router with custom middleware for better performance
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(gin.Logger()) // Add logger

	// CORS Configuration
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://127.0.0.1:3000", "https://hire-it.vercel.app", "https://hireit-nine.vercel.app"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Setup Routes
	routes.SetupRoutes(router, authCtrl, googleCtrl, youtubeCtrl, publicCtrl, assessCtrl, interviewCtrl)

	// Admin Question Bank routes
	router.POST("/api/admin/questions/import", questionBankController.ImportQuestions)
	router.POST("/api/admin/questions/structure", questionBankController.SaveStructure)
	router.GET("/api/admin/questions/config", questionBankController.GetConfig)
	router.GET("/api/admin/questions", questionBankController.ListQuestions)
	router.GET("/api/admin/questions/count", questionBankController.CountQuestions)
	router.POST("/api/admin/questions/upload-csv", questionBankController.UploadCSV)
	router.PUT("/api/admin/questions/:id", questionBankController.UpdateQuestion)
	router.DELETE("/api/admin/questions/:id", questionBankController.DeleteQuestion)
	// Audio upload for Listening questions
	router.POST("/api/admin/audio-upload", questionBankController.UploadAudio)
	// Serve uploaded audio files
	router.Static("/audio", "./public/audio")

	router.GET("/api/telegram/image/:fileId", teleProxyCtrl.GetTelegramImage)

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

	// Initialize Worker Pool (5 workers, queue size of 100)
	pool := utils.InitWorkerPool(5, 100)
	defer pool.Shutdown()

	// Start Server in a goroutine for graceful shutdown
	go func() {
		logger.Infof("Server running on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Give outstanding requests 5 seconds to complete
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Fatalf("Server forced to shutdown: %v", err)
	}

	// Disconnect MongoDB
	if err := client.Disconnect(shutdownCtx); err != nil {
		logger.Errorf("Error disconnecting from MongoDB: %v", err)
	}

	logger.Info("Server exited gracefully")
}
