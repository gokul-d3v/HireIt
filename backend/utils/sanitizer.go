package utils

import (
	"sync"

	"github.com/microcosm-cc/bluemonday"
)

var (
	strictSanitizer *bluemonday.Policy
	ugcSanitizer    *bluemonday.Policy
	sanitizerOnce   sync.Once
)

// initSanitizers ensures that our sanitization policies are only created once
func initSanitizers() {
	sanitizerOnce.Do(func() {
		// Strict policy removes all HTML elements and their attributes
		strictSanitizer = bluemonday.StrictPolicy()

		// UGCPolicy allows a broad selection of HTML elements and attributes that are safe for user generated content
		ugcSanitizer = bluemonday.UGCPolicy()
	})
}

// SanitizeStrict strips all HTML from the input string
func SanitizeStrict(input string) string {
	initSanitizers()
	return strictSanitizer.Sanitize(input)
}

// SanitizeUGC removes dangerous HTML but allows safe elements (like basic formatting)
func SanitizeUGC(input string) string {
	initSanitizers()
	return ugcSanitizer.Sanitize(input)
}
