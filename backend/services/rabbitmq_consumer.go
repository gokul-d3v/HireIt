package services

import (
	"context"
	"encoding/json"
	"errors"
	"hireit-backend/models"
	"hireit-backend/repositories"
	"hireit-backend/utils"
	"os"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"golang.org/x/crypto/bcrypt"
)

type CandidateDetailsConsumer struct {
	userRepo repositories.UserRepository
	logger   interface {
		Infof(string, ...interface{})
		Warnf(string, ...interface{})
		Errorf(string, ...interface{})
	}
	conn      *amqp.Connection
	channel   *amqp.Channel
	queueName string
}

type candidateDetailsMessage struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
}

func NewCandidateDetailsConsumer(userRepo repositories.UserRepository) *CandidateDetailsConsumer {
	return &CandidateDetailsConsumer{
		userRepo: userRepo,
		logger:   utils.GetLogger(),
	}
}

func (c *CandidateDetailsConsumer) Start(ctx context.Context) error {
	rabbitURL := strings.TrimSpace(os.Getenv("RABBITMQ_URL"))
	if rabbitURL == "" {
		c.logger.Warnf("RabbitMQ URL not configured; candidate-details consumer disabled")
		return nil
	}

	queueName := strings.TrimSpace(os.Getenv("RABBITMQ_QUEUE"))
	if queueName == "" {
		queueName = "candidate_details"
	}

	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return err
	}

	channel, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return err
	}

	_, err = channel.QueueDeclare(
		queueName,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		_ = channel.Close()
		_ = conn.Close()
		return err
	}

	deliveries, err := channel.Consume(
		queueName,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		_ = channel.Close()
		_ = conn.Close()
		return err
	}

	c.conn = conn
	c.channel = channel
	c.queueName = queueName

	c.logger.Infof("RabbitMQ candidate-details consumer started on queue %s", queueName)

	go c.consume(ctx, deliveries)
	return nil
}

func (c *CandidateDetailsConsumer) Close() {
	if c.channel != nil {
		_ = c.channel.Close()
	}
	if c.conn != nil {
		_ = c.conn.Close()
	}
}

func (c *CandidateDetailsConsumer) consume(ctx context.Context, deliveries <-chan amqp.Delivery) {
	for {
		select {
		case <-ctx.Done():
			c.logger.Infof("RabbitMQ candidate-details consumer shutting down")
			return
		case delivery, ok := <-deliveries:
			if !ok {
				c.logger.Warnf("RabbitMQ deliveries channel closed for queue %s", c.queueName)
				return
			}

			if err := c.handleDelivery(delivery.Body); err != nil {
				c.logger.Errorf("Failed to process RabbitMQ candidate payload: %v", err)
				_ = delivery.Nack(false, false)
				continue
			}

			_ = delivery.Ack(false)
		}
	}
}

func (c *CandidateDetailsConsumer) handleDelivery(body []byte) error {
	var payload candidateDetailsMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}

	payload.Name = utils.SanitizeStrict(payload.Name)
	payload.Email = strings.TrimSpace(strings.ToLower(payload.Email))
	payload.Phone = utils.NormalizePhone(payload.Phone)

	if payload.Email == "" && payload.Phone == "" {
		return errors.New("candidate payload must include at least email or phone")
	}

	password, err := bcrypt.GenerateFromPassword([]byte("candidate123"), 10)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = c.userRepo.UpsertCandidate(ctx, &models.User{
		Name:      payload.Name,
		Email:     payload.Email,
		Phone:     payload.Phone,
		Password:  string(password),
		Role:      "candidate",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	return err
}
