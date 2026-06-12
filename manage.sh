#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
LOG_DIR="${TMPDIR:-/tmp}/yt-transcript"
APP_PATTERN='node server.js'
mkdir -p "$LOG_DIR"

start() {
  if pgrep -f "$APP_PATTERN" >/dev/null 2>&1; then
    echo "ytTranscript already running (pid $(pgrep -n -f "$APP_PATTERN"))."
    exit 0
  fi
  nohup npm start > "$LOG_DIR/server.log" 2> "$LOG_DIR/server.err" &
  sleep 2
  if pgrep -f "$APP_PATTERN" >/dev/null 2>&1; then
    echo "started $(pgrep -n -f "$APP_PATTERN")"
  else
    echo "started (waiting for node server.js to appear in process table)"
  fi
}

stop() {
  pkill -f "$APP_PATTERN" 2>/dev/null || true
  pkill -f 'npm start' 2>/dev/null || true
  echo "stopped"
}

status() {
  if pid=$(pgrep -n -f "$APP_PATTERN" 2>/dev/null); then
    echo "running $pid"
  else
    echo "stopped"
  fi
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
