#!/bin/bash

# Screeps Stats Docker Setup Script
echo "Setting up Screeps Stats Docker environment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp example.env .env
    echo "Please edit .env file with your Screeps token and other settings"
    echo "You can find your token at: https://screeps.com/a/#!/account/auth-tokens"
fi

# Check Docker and Docker Compose
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed or not in PATH"
    exit 1
fi

# Enable BuildKit for better build performance
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "Docker BuildKit enabled"
echo "Starting services..."

# Build and start services
docker-compose up -d --build

echo ""
echo "Services started!"
echo "Prometheus UI: http://localhost:9090"
echo "Grafana UI: http://localhost:3000 (admin/admin)"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop services: docker-compose down" 