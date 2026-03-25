# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy source code
COPY . .

# Use go mod tidy for 1.24 compatibility
RUN go mod tidy

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies (e.g., certificates for HTTPS)
RUN apk add --no-cache ca-certificates

# Copy the binary and other needed files
COPY --from=builder /app/main .

# Ensure binary is executable
RUN chmod +x ./main

EXPOSE 8080

CMD ["./main"]
