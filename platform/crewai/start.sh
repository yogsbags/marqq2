#!/bin/bash

# CrewAI Multi-Agent Backend Startup Script

set -e

echo "🤖 Starting CrewAI Multi-Agent Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your API keys before running again"
    exit 1
fi

# Check for required environment variables
if ! grep -q "GROQ_API_KEY=gsk_" .env; then
    echo "❌ Error: GROQ_API_KEY not set in .env file"
    echo "📝 Please add your Groq API key to .env file"
    exit 1
fi

# Start server
echo "🚀 Starting FastAPI server on port 8002..."
echo "📡 API Docs: http://localhost:8002/docs"
echo "💊 Health Check: http://localhost:8002/health"
echo ""

python main.py
