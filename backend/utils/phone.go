package utils

import "regexp"

var nonDigitPhoneChars = regexp.MustCompile(`\D`)

func NormalizePhone(input string) string {
	cleaned := nonDigitPhoneChars.ReplaceAllString(input, "")

	switch {
	case len(cleaned) == 12 && cleaned[:2] == "91":
		return cleaned[2:]
	case len(cleaned) == 11 && cleaned[0] == '0':
		return cleaned[1:]
	default:
		return cleaned
	}
}
