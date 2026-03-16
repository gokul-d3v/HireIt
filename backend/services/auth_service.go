package services

import (
	"context"
	"errors"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"hireit-backend/utils"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// AuthService defines business logic for authentication
type AuthService interface {
	Signup(ctx context.Context, user *models.User) (string, error)
	Login(ctx context.Context, email, password string) (string, string, error)
	SetPassword(ctx context.Context, userID string, newPassword string) error
	GoogleLogin(ctx context.Context, email, name, role string) (string, string, bool, error)
	StartPublicAssessment(ctx context.Context, name, email, phone string) (string, *models.User, error)
	StartDemoAssessment(ctx context.Context) (string, *models.User, error)
	StartAssessmentWithOTP(ctx context.Context, phone, otp string) (string, *models.User, error)
}

type authService struct {
	userRepo repositories.UserRepository
}

// NewAuthService creates a new implementation of AuthService
func NewAuthService(repo repositories.UserRepository) AuthService {
	return &authService{userRepo: repo}
}

func (s *authService) Signup(ctx context.Context, user *models.User) (string, error) {
	// Check if user exists
	_, err := s.userRepo.FindByEmail(ctx, user.Email)
	if err == nil {
		return "", errors.New("user already exists")
	}

	// Sanitize Input
	user.Name = utils.SanitizeStrict(user.Name)
	if user.Phone != "" {
		user.Phone = utils.SanitizeStrict(user.Phone)
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), 10)
	if err != nil {
		return "", err
	}
	user.Password = string(hashedPassword)
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	// Create user
	id, err := s.userRepo.Create(ctx, user)
	if err != nil {
		return "", err
	}

	return id.Hex(), nil
}

func (s *authService) Login(ctx context.Context, email, password string) (string, string, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return "", "", errors.New("invalid email or password")
	}

	// Compare password
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password))
	if err != nil {
		return "", "", errors.New("invalid email or password")
	}

	// Generate JWT
	tokenString, err := s.generateJWT(user)
	if err != nil {
		return "", "", err
	}

	return tokenString, user.Role, nil
}

func (s *authService) SetPassword(ctx context.Context, userID string, newPassword string) error {
	id, err := utils.ToObjectID(userID)
	if err != nil {
		return err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), 10)
	if err != nil {
		return err
	}

	return s.userRepo.UpdatePassword(ctx, id, string(hashedPassword))
}

func (s *authService) GoogleLogin(ctx context.Context, email, name, role string) (string, string, bool, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	isNew := false

	if err != nil {
		// Create new user
		newUser := models.User{
			Name:      name,
			Email:     email,
			Role:      role,
			Password:  "", // No password for Google users
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		id, err := s.userRepo.Create(ctx, &newUser)
		if err != nil {
			return "", "", false, err
		}
		newUser.ID = id
		user = &newUser
		isNew = true
	} else if user.Role != role {
		return "", "", false, errors.New("role mismatch")
	}

	// Generate JWT
	tokenString, err := s.generateJWT(user)
	if err != nil {
		return "", "", false, err
	}

	return tokenString, user.Role, isNew, nil
}

func (s *authService) StartPublicAssessment(ctx context.Context, name, email, phone string) (string, *models.User, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		// Create legacy candidate
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("candidate123"), 10)
		newUser := models.User{
			Name:      name,
			Email:     email,
			Phone:     phone,
			Password:  string(hashedPassword),
			Role:      "candidate",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		id, err := s.userRepo.Create(ctx, &newUser)
		if err != nil {
			return "", nil, err
		}
		newUser.ID = id
		user = &newUser
	}

	tokenString, err := s.generateJWT(user)
	if err != nil {
		return "", nil, err
	}

	return tokenString, user, nil
}

func (s *authService) StartDemoAssessment(ctx context.Context) (string, *models.User, error) {
	// Create a unique dummy email for this demo session
	demoEmail := "demo_" + utils.GenerateRandomString(8) + "@demo.local"
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("demo123"), 10)
	
	demoUser := models.User{
		Name:      "Demo User",
		Email:     demoEmail,
		Phone:     "",
		Password:  string(hashedPassword),
		Role:      "candidate",
		IsDemo:    true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	
	id, err := s.userRepo.Create(ctx, &demoUser)
	if err != nil {
		return "", nil, err
	}
	demoUser.ID = id

	tokenString, err := s.generateJWT(&demoUser)
	if err != nil {
		return "", nil, err
	}

	return tokenString, &demoUser, nil
}

func (s *authService) StartAssessmentWithOTP(ctx context.Context, phone, otp string) (string, *models.User, error) {
	// Validate OTP against environment variable
	expectedOTP := os.Getenv("DEVELOPMENT_OTP")
	if expectedOTP == "" {
		return "", nil, errors.New("OTP not configured")
	}
	if otp != expectedOTP {
		return "", nil, errors.New("invalid OTP")
	}

	// Look up candidate by phone number (they must be pre-registered)
	user, err := s.userRepo.FindByPhone(ctx, phone)
	if err != nil {
		return "", nil, errors.New("candidate not found. please check your phone number")
	}

	tokenString, err := s.generateJWT(user)
	if err != nil {
		return "", nil, err
	}

	return tokenString, user, nil
}

func (s *authService) generateJWT(user *models.User) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID.Hex(),
		"role": user.Role,
		"exp":  time.Now().Add(time.Hour * 24).Unix(),
	})

	return token.SignedString([]byte(os.Getenv("JWT_SECRET")))
}
