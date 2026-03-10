package utils

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Logger *zap.SugaredLogger

func InitLogger() {
	config := zap.NewProductionConfig()

	// Custom encoder config for better readability if needed
	config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	config.EncoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder

	// Check for environment to decide log level/format
	if os.Getenv("APP_ENV") == "development" {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeTime = zapcore.TimeEncoderOfLayout("15:04:05")
	}

	logger, err := config.Build()
	if err != nil {
		panic(err)
	}

	Logger = logger.Sugar()
}

func GetLogger() *zap.SugaredLogger {
	if Logger == nil {
		InitLogger()
	}
	return Logger
}
