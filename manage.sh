#!/bin/bash

# ytTranscript Service Manager — foreground/dev launcher
# (LaunchAgents removed due to macOS Sequoia launchctl I/O errors)

PROJECT_DIR="/Users/radek/yt-transcript"
LOG_DIR="$PROJECT_DIR/logs"
PIDFILE="$LOG_DIR/.pids"

mkdir -p "$LOG_DIR"

start_backend() {
  cd "$PROJECT_DIR" || exit 1
  nohup node server.js > "$LOG_DIR/backend-out.log" 2> "$LOG_DIR/backend-error.log" &
  echo $! > "$PIDFILE"
  sleep 1
  if lsof -i:4000 >/dev/null 2>&1; then
    echo "  ✓ Backend (port 4000)"
  else
    echo "  ✗ Backend failed to start"
    return 1
  fi
}

start_frontend() {
  cd "$PROJECT_DIR/client" || exit 1
  nohup node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000 > "$LOG_DIR/frontend-out.log" 2> "$LOG_DIR/frontend-error.log" &
  sleep 2
  if lsof -i:3000 >/dev/null 2>&1; then
    echo "  ✓ Frontend (port 3000)"
  else
    echo "  ✗ Frontend failed to start"
    return 1
  fi
}

stop_services() {
  if [ -f "$PIDFILE" ]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null
    done < "$PIDFILE"
    rm -f "$PIDFILE"
  fi
  lsof -ti:4000 | xargs kill -9 2>/dev/null
  lsof -ti:3000 | xargs kill -9 2>/dev/null
}

status() {
  echo "ytTranscript services:"
  echo "  Backend:"
  lsof -i:4000 2>/dev/null | grep LISTEN && echo "    Running" || echo "    Down"
  echo "  Frontend:"
  lsof -i:3000 2>/dev/null | grep LISTEN && echo "    Running" || echo "    Down"
  echo ""
  echo "Tailscale:"
  echo "  Frontend: http://100.127.3.65:3000"
  echo "  API:      http://100.127.3.65:4000"
}

case "$1" in
  start)
    echo "Starting ytTranscript services..."
    start_backend && start_frontend
    ;;
  stop)
    echo "Stopping ytTranscript services..."
    stop_services
    echo "  ✗ Backend (port 4000)"
    echo "  ✗ Frontend (port 3000)"
    ;;
  restart)
    echo "Restarting ytTranscript services..."
    stop_services
    sleep 1
    start_backend && start_frontend
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
