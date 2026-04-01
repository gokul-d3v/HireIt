package utils

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"time"
)

// GenerateRandomString generates a random hex string of the given byte length
func GenerateRandomString(n int) string {
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		return "fallback"
	}
	return hex.EncodeToString(bytes)
}

// GeneratePINSecret generates a 32-byte random hex string to use as a per-assessment HMAC secret.
func GeneratePINSecret() string {
	return GenerateRandomString(32)
}

// examTimeWindow returns the current 30-minute window index.
// Window 0 = [00:00–00:29], Window 1 = [00:30–00:59], etc.
func examTimeWindow(t time.Time) int64 {
	return t.Unix() / (30 * 60)
}

// computePIN derives a 4-digit PIN from the secret and a time window index.
func computePIN(secret string, window int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	windowBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(windowBytes, uint64(window))
	mac.Write(windowBytes)
	sum := mac.Sum(nil)
	// Use last 4 bytes and take modulo 10000 for a 4-digit number
	code := binary.BigEndian.Uint32(sum[len(sum)-4:]) % 10000
	return fmt.Sprintf("%04d", code)
}

// CurrentExamPIN returns the current valid 4-digit PIN for the given secret.
func CurrentExamPIN(secret string) string {
	return computePIN(secret, examTimeWindow(time.Now()))
}

// VerifyExamPIN checks if the provided PIN is valid for the current or previous
// 30-minute window. This gives candidates a transition period when the PIN rotates.
// Accepts current window and one previous window to avoid edge-case lockouts.
func VerifyExamPIN(secret, pin string) bool {
	now := time.Now()
	currentWindow := examTimeWindow(now)
	// Accept current window and the immediately preceding window
	return pin == computePIN(secret, currentWindow) ||
		pin == computePIN(secret, currentWindow-1)
}

// NextPINRotateAt returns the UTC time when the current PIN will rotate.
func NextPINRotateAt() time.Time {
	now := time.Now()
	window := examTimeWindow(now)
	// Next rotation is at the start of the next window
	nextWindowStart := (window + 1) * 30 * 60
	return time.Unix(nextWindowStart, 0).UTC()
}
