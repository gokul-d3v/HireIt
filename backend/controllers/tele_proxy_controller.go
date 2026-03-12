package controllers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

type TelegramProxyController struct{}

func NewTelegramProxyController() *TelegramProxyController {
	return &TelegramProxyController{}
}

func (ctrl *TelegramProxyController) GetTelegramImage(c *gin.Context) {
	fileId := c.Param("fileId")
	if fileId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fileId is required"})
		return
	}

	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "telegram bot token not configured"})
		return
	}

	// 1. Get file path from Telegram
	getFileUrl := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", botToken, fileId)
	resp, err := http.Get(getFileUrl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to contact telegram api"})
		return
	}
	defer resp.Body.Close()

	var getFileResp struct {
		Ok     bool `json:"ok"`
		Result struct {
			FilePath string `json:"file_path"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&getFileResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse telegram response"})
		return
	}

	if !getFileResp.Ok || getFileResp.Result.FilePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found on telegram servers"})
		return
	}

	// 2. Stream the actual file content
	downloadUrl := fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", botToken, getFileResp.Result.FilePath)
	imgResp, err := http.Get(downloadUrl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to download file from telegram"})
		return
	}
	defer imgResp.Body.Close()

	// 3. Set proper content type and stream to client
	contentType := imgResp.Header.Get("Content-Type")
	filePath := getFileResp.Result.FilePath

	// Force correct video content types based on file extension
	if contentType == "application/octet-stream" {
		if len(filePath) > 5 {
			ext := filePath[len(filePath)-4:]
			switch ext {
			case ".mp4":
				contentType = "video/mp4"
			case "webm": // for .webm
				contentType = "video/webm"
			case ".png":
				contentType = "image/png"
			case ".jpg", "jpeg":
				contentType = "image/jpeg"
			}
		}
	}

	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", "inline")
	c.Header("Cache-Control", "public, max-age=31536000") // Cache for 1 year
	if _, err := io.Copy(c.Writer, imgResp.Body); err != nil {
		return
	}
}

// Corrected flow follows.
