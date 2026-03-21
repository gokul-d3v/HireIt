package services

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

type OTPService interface {
	SendOTP(phone string) error
	VerifyOTP(phone, otp string) (bool, error)
}

type otpService struct {
	baseURL    string
	templateID string
	authKey    string
}

func NewOTPService() OTPService {
	return &otpService{
		baseURL:    os.Getenv("MSG91_BASE_URL"),
		templateID: os.Getenv("MSG91_TEMPLATE_ID"),
		authKey:    os.Getenv("MSG91_AUTH_KEY"),
	}
}

func (s *otpService) SendOTP(phone string) error {
	if s.authKey == "" {
		return fmt.Errorf("MSG91_AUTH_KEY not configured")
	}

	// Clean phone number: remove +, spaces, dashes
	phone = strings.ReplaceAll(phone, "+", "")
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")

	// Default to India country code if 10 digits are provided
	if len(phone) == 10 {
		phone = "91" + phone
	}

	url := fmt.Sprintf("%s?template_id=%s&mobile=%s&authkey=%s", 
		s.baseURL, s.templateID, phone, s.authKey)

	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("MSG91 error: %s (status: %d)", string(body), resp.StatusCode)
	}

	return nil
}

func (s *otpService) VerifyOTP(phone, otp string) (bool, error) {
	if s.authKey == "" {
		return false, fmt.Errorf("MSG91_AUTH_KEY not configured")
	}

	phone = strings.ReplaceAll(phone, "+", "")
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")

	// Default to India country code if 10 digits are provided
	if len(phone) == 10 {
		phone = "91" + phone
	}

	// MSG91 Verify API: GET /api/v5/otp/verify
	url := fmt.Sprintf("%s/verify?otp=%s&mobile=%s&authkey=%s", 
		s.baseURL, otp, phone, s.authKey)

	resp, err := http.Get(url)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	// MSG91 returns json with "type": "success" or "type": "error"
	if strings.Contains(bodyStr, "\"type\":\"success\"") {
		return true, nil
	}

	return false, fmt.Errorf("OTP verification failed: %s", bodyStr)
}
