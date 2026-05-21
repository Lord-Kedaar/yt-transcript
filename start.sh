#!/bin/bash

# ytTranscript — foreground launcher (single port: 4000)

# Kill any existing instances
lsof -ti:4000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null  # clean stale Vite

cd /Users/radek/Documents/Projects/yt-transcript

# Ensure dist is built
echo "Building frontend..."
cd client && npm run build 2>&1 | tail -5
cd ..

# Start Express (serves SPA + API on :4000)
echo "Starting ytTranscript..."
node server.js
