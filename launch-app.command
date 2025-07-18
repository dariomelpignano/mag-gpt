#!/bin/bash

# MAG-GPT App Launcher
# Double-click this file to start the application

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

# Start the development server
npm run dev

echo ""
echo "✋ Server stopped. You can close this window."

# Keep the terminal open so user can see any final messages
read -p "Press Enter to close..." 