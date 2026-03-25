package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// ExamResultMessage is the payload published to betexamresultqueue after exam completion.
type ExamResultMessage struct {
	Mobile string `json:"mobile"`
	Result string `json:"result"` // "passed" | "failed"
	Marks  string `json:"marks"`
	Total  string `json:"total"`
}

// PublishExamResult publishes an exam result to the betexamresultqueue.
// It is fire-and-forget — call it in a goroutine and do not block the response on it.
func PublishExamResult(mobile string, passed bool, marks, total int) error {
	rabbitURL := strings.TrimSpace(os.Getenv("RABBITMQ_URL"))
	if rabbitURL == "" {
		return fmt.Errorf("RABBITMQ_URL not configured; skipping exam result publish")
	}

	result := "failed"
	if passed {
		result = "passed"
	}

	msg := ExamResultMessage{
		Mobile: mobile,
		Result: result,
		Marks:  strconv.Itoa(marks),
		Total:  strconv.Itoa(total),
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal exam result: %w", err)
	}

	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return fmt.Errorf("rabbitmq dial failed: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("rabbitmq channel open failed: %w", err)
	}
	defer ch.Close()

	queueName := strings.TrimSpace(os.Getenv("RABBITMQ_RESULT_QUEUE"))
	if queueName == "" {
		return fmt.Errorf("RABBITMQ_RESULT_QUEUE not configured")
	}
	_, err = ch.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("rabbitmq queue declare failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = ch.PublishWithContext(ctx, "", queueName, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})
	if err != nil {
		return fmt.Errorf("rabbitmq publish failed: %w", err)
	}

	return nil
}
