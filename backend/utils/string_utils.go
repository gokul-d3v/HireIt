package utils

import (
	"crypto/rand"
	"encoding/hex"
)

// GenerateRandomString generates a random hex string of the given byte length
func GenerateRandomString(n int) string {
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback or panic, though rand.Read rarely fails
		return "fallback"
	}
	return hex.EncodeToString(bytes)
}
