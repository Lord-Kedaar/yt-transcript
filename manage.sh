#!/bin/bash

LABEL="com.yttranscript"
BACKEND_PLIST="$HOME/Library/LaunchAgents/${LABEL}.backend.plist"
FRONTEND_PLIST="$HOME/Library/LaunchAgents/${LABEL}.frontend.plist"

case "$1" in
  start)
    echo "Starting ytTranscript services..."
    launchctl unload "$BACKEND_PLIST" 2>/dev/null
    launchctl unload "$FRONTEND_PLIST" 2>/dev/null
    sleep 1
    launchctl load "$BACKEND_PLIST" && echo "  ✓ Backend (port 4000)"
    launchctl load "$FRONTEND_PLIST" && echo "  ✓ Frontend (port 3000)"
    ;;
  stop)
    echo "Stopping ytTranscript services..."
    launchctl unload "$BACKEND_PLIST" && echo "  ✗ Backend (port 4000)"
    launchctl unload "$FRONTEND_PLIST" && echo "  ✗ Frontend (port 3000)"
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  status)
    echo "ytTranscript services:"
    launchctl list | grep "${LABEL}" 2>/dev/null || echo "  No services running"
    echo ""
    echo "Ports:"
    lsof -i :3000 2>/dev/null | head -1 || echo "  3000: not listening"
    lsof -i :4000 2>/dev/null | head -1 || echo "  4000: not listening"
    echo ""
    echo "Tailscale:"
    echo "  Frontend: http://100.127.3.65:3000"
    echo "  API:      http://100.127.3.65:4000"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
