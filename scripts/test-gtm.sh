#!/bin/bash

# GTM Module Integration - Quick Test Script
# This script starts both frontend and backend servers for testing

echo "🚀 Starting GTM Module Testing Environment..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from martech directory"
    echo "   cd /Users/yogs87/Downloads/sanity/projects/martech"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if backend exists
if [ ! -f "platform/content-engine/backend-server.js" ]; then
    echo "❌ Error: Backend server not found"
    exit 1
fi

# Check for environment variables
if [ ! -f "platform/content-engine/.env" ] && [ ! -f ".env" ]; then
    echo "⚠️  Warning: No .env file found"
    echo "   GTM strategy generation requires GEMINI_API_KEY or GOOGLE_API_KEY"
    echo ""
fi

echo "✅ Pre-flight checks passed"
echo ""
echo "Starting servers..."
echo "  - Frontend: http://localhost:3007"
echo "  - Backend:  http://localhost:3008"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Function to kill both processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

trap cleanup INT TERM

# Start backend in background
(cd platform/content-engine && node backend-server.js) &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start frontend in background
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
