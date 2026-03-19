# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy source code
COPY . .

# Force compatibility inside the container AFTER copying source
RUN sed -i 's/go 1.25.0/go 1.24.0/' go.mod && \
    go mod edit -droprequire=google.golang.org/genproto/googleapis/rpc && \
    rm -f go.sum && \
    go mod tidy

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
