package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
)

type TelegramResponse struct {
	Ok     bool `json:"ok"`
	Result struct {
		MessageID int `json:"message_id"`
		Photo     []struct {
			FileID   string `json:"file_id"`
			FileSize int    `json:"file_size"`
			Width    int    `json:"width"`
			Height   int    `json:"height"`
		} `json:"photo"`
		Document struct {
			FileID string `json:"file_id"`
		} `json:"document"`
	} `json:"result"`
}

func SendTelegramMessage(message string) error {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")

	if botToken == "" || chatID == "" {
		return fmt.Errorf("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)

	requestBody, _ := json.Marshal(map[string]string{
		"chat_id":    chatID,
		"text":       message,
		"parse_mode": "HTML",
	})

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(requestBody))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to send telegram message, status: %d", resp.StatusCode)
	}

	return nil
}

func SendTelegramVideo(video []byte, filename string, caption string) (string, error) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")

	if botToken == "" || chatID == "" {
		return "", fmt.Errorf("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendDocument", botToken)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add chat_id
	if err := writer.WriteField("chat_id", chatID); err != nil {
		return "", err
	}

	// Add caption
	if err := writer.WriteField("caption", caption); err != nil {
		return "", err
	}
	if err := writer.WriteField("parse_mode", "HTML"); err != nil {
		return "", err
	}

	// Add file
	part, err := writer.CreateFormFile("document", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(video); err != nil {
		return "", err
	}

	if err := writer.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to upload video to telegram, status: %d", resp.StatusCode)
	}

	var tgResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&tgResp); err != nil {
		return "", fmt.Errorf("failed to decode telegram response: %v", err)
	}

	if tgResp.Result.Document.FileID != "" {
		return tgResp.Result.Document.FileID, nil
	}

	return "msg_" + fmt.Sprint(tgResp.Result.MessageID), nil
}

func SendTelegramPhoto(base64Str string, caption string) (string, error) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")

	if botToken == "" || chatID == "" {
		return "", fmt.Errorf("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")
	}

	// Remove data URL prefix if present
	if strings.Contains(base64Str, ",") {
		base64Str = strings.Split(base64Str, ",")[1]
	}

	imageData, err := base64.StdEncoding.DecodeString(base64Str)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64 image: %v", err)
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", botToken)

	var b bytes.Buffer
	w := multipart.NewWriter(&b)

	if err := w.WriteField("chat_id", chatID); err != nil {
		return "", err
	}
	if err := w.WriteField("caption", caption); err != nil {
		return "", err
	}
	if err := w.WriteField("parse_mode", "HTML"); err != nil {
		return "", err
	}

	fw, err := w.CreateFormFile("photo", "snapshot.jpg")
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(fw, bytes.NewReader(imageData)); err != nil {
		return "", err
	}
	w.Close()

	req, err := http.NewRequest("POST", url, &b)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to send photo to telegram, status: %d", resp.StatusCode)
	}

	var tgResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&tgResp); err != nil {
		return "", fmt.Errorf("failed to decode telegram response: %v", err)
	}

	if !tgResp.Ok || len(tgResp.Result.Photo) == 0 {
		return "", fmt.Errorf("telegram photo upload failed or no photo data in response")
	}

	// Return the file_id of the largest photo version
	return tgResp.Result.Photo[len(tgResp.Result.Photo)-1].FileID, nil
}

