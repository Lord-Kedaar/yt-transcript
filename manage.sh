#!/bin/bash

# ytTranscript Service Manager — single-port: Express on :4000 serves SPA + API

PROJECT_DIR="/Users/radek/Documents/Projects/yt-transcript"
LOG_DIR="$PROJECT_DIR/logs"
PIDFILE="$LOG_DIR/.pids"

mkdir -p "$LOG_DIR"

start_app() {
  cd "$PROJECT_DIR" || exit 1
  nohup node server.js > "$LOG_DIR/app-out.log" 2> "$LOG_DIR/app-error.log" &
  echo $! > "$PIDFILE"
  sleep 1
  if lsof -i:4000 >/dev/null 2>&1; then
    echo "  ✓ ytTranscript (port 4000)"
  else
    echo "  ✗ ytTranscript failed to start"
    return 1
  fi
}

stop_app() {
  if [ -f "$PIDFILE" ]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null
    done < "$PIDFILE"
    rm -f "$PIDFILE"
  fi
  lsof -ti:4000 | xargs kill -9 2>/dev/null
  lsof -ti:3000 | xargs kill -9 2>/dev/null  # clean up any stale Vite
}

status() {
  echo "ytTranscript:"
  lsof -i:4000 2>/dev/null | grep LISTEN && echo "  Running on port 4000" || echo "  Down"
  echo ""
  echo "Tailscale:"
  echo "  http://100.127.3.65:4000"
}

case "$1" in
  start)
    echo "Starting ytTranscript..."
    start_app
    ;;
  stop)
    echo "Stopping ytTranscript..."
    stop_app
    echo "  Stopped"
    ;;
  restart)
    echo "Restarting ytTranscript..."
    stop_app
    sleep 1
    start_app
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
