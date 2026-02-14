package main

import (
	"broassess-backend/controllers"
	"broassess-backend/middleware"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var client *mongo.Client

func main() {
	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	// MongoDB Connection
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	client, err = mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
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
	controllers.InitAuthController(userCollection)

	// Initialize Router
	router := gin.Default()

	// Public Routes
	router.POST("/signup", controllers.Signup)
	router.POST("/login", controllers.Login)

	// Protected Routes (Group)
	protected := router.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	{
		protected.GET("/dashboard", func(c *gin.Context) {
			role, _ := c.Get("role")
			c.JSON(http.StatusOK, gin.H{
				"message": "Welcome to the dashboard",
				"role":    role,
			})
		})
	}

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "BroAssess Backend Running",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server running on port %s\n", port)
	router.Run(":" + port)
}
