#!/bin/bash

# MAG-GPT Docker Startup Script
echo "🚀 Starting MAG-GPT with Docker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Choose Docker Compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp docker.env.example .env
    print_warning "Please edit .env file to configure your LM Studio URL and user credentials."
    print_warning "Example: nano .env"
    echo ""
fi

# Choose compose file
COMPOSE_FILE="docker-compose.simple.yml"
if [ "$1" = "--full" ] || [ "$1" = "--nginx" ]; then
    COMPOSE_FILE="docker-compose.yml"
    print_status "Using full deployment with nginx..."
else
    print_status "Using simple deployment (app only)..."
fi

# Stop existing containers
print_status "Stopping existing containers..."
$DOCKER_COMPOSE -f $COMPOSE_FILE down

# Build and start
print_status "Building and starting MAG-GPT..."
$DOCKER_COMPOSE -f $COMPOSE_FILE up --build -d

# Check if containers are running
sleep 5
if $DOCKER_COMPOSE -f $COMPOSE_FILE ps | grep -q "Up"; then
    print_success "MAG-GPT is starting up!"
    echo ""
    print_status "🌐 Application will be available at: http://localhost:3000"
    print_status "📊 Health check: curl http://localhost:3000/api/models"
    print_status "📋 View logs: $DOCKER_COMPOSE -f $COMPOSE_FILE logs -f"
    print_status "🔄 Restart: $DOCKER_COMPOSE -f $COMPOSE_FILE restart"
    print_status "🛑 Stop: $DOCKER_COMPOSE -f $COMPOSE_FILE down"
    echo ""
    
    # Show container status
    print_status "Container status:"
    $DOCKER_COMPOSE -f $COMPOSE_FILE ps
    
    # Optionally show logs
    if [ "$2" = "--logs" ]; then
        echo ""
        print_status "Showing live logs (Ctrl+C to exit):"
        $DOCKER_COMPOSE -f $COMPOSE_FILE logs -f
    fi
else
    print_error "Failed to start containers. Check logs:"
    $DOCKER_COMPOSE -f $COMPOSE_FILE logs
    exit 1
fi 