# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy dependency files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies (e.g., certificates for HTTPS)
RUN apk add --no-cache ca-certificates

# Copy the binary and other needed files
COPY --from=builder /app/main .
COPY --from=builder /app/.env .

# Ensure binary is executable
RUN chmod +x ./main

EXPOSE 8080

CMD ["./main"]
