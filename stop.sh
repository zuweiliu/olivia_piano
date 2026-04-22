#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛑 Stopping Piano Coach..."

stop_pid() {
  local pidfile="$1"
  local name="$2"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "  Stopped $name (pid $pid)."
    fi
    rm -f "$pidfile"
  fi
}

stop_pid "$SCRIPT_DIR/logs/frontend.pid" "frontend"
stop_pid "$SCRIPT_DIR/logs/backend.pid"  "backend"

# Also kill any stragglers by port
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

echo "✅ Stopped."
