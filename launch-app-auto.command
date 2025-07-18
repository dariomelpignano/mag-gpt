#!/bin/bash

# MAG-GPT App Launcher (Auto-Browser)
# Double-click this file to start the application and open browser

echo "🚀 Starting MAG-GPT Application..."
echo "================================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to the project directory
cd "$SCRIPT_DIR"

echo "📁 Project directory: $SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔧 Starting development server..."
echo "🌐 The app will be available at: http://localhost:3001"
echo ""
echo "💡 To stop the server: Press Ctrl+C"
echo "💡 To close this window: Close the terminal or press Ctrl+C then close"
echo ""

# Start the development server in background
npm run dev &

# Get the process ID
SERVER_PID=$!

# Wait a few seconds for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Open browser
echo "🌐 Opening browser..."
open http://localhost:3001

# Bring the server process to foreground
echo "📡 Server is running (PID: $SERVER_PID)"
echo "🔴 Press Ctrl+C to stop the server"
wait $SERVER_PID

echo ""
echo "✋ Server stopped. You can close this window."

# Keep the terminal open so user can see any final messages
read -p "Press Enter to close..." 