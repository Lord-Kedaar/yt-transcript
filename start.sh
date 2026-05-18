#!/bin/bash

# Kill any existing instances
pkill -f "node server.js" 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null

cd /Users/radek/yt-transcript

# Start backend
node server.js &
BACKEND_PID=$!

sleep 1

# Start frontend  
cd client && npx vite --host 0.0.0.0 &
FRONTEND_PID=$!

echo "ytTranscript started:"
echo "  Backend (API): http://localhost:4000"
echo "  Frontend (UI): http://localhost:3000"

wait
