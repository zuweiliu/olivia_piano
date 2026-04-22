#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🎹 Starting Piano Coach..."

# Backend
echo "  Starting backend..."
cd "$SCRIPT_DIR/backend"
PATH="/opt/homebrew/bin:$PATH" .venv/bin/uvicorn main:app --reload --port 8000 > ../logs/backend.log 2>&1 &
echo $! > ../logs/backend.pid

# Wait for backend to be ready
for i in {1..20}; do
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "  Backend ready."
    break
  fi
  sleep 1
done

# Frontend
echo "  Starting frontend..."
cd "$SCRIPT_DIR/frontend"
/opt/homebrew/bin/npm run dev > ../logs/frontend.log 2>&1 &
echo $! > ../logs/frontend.pid

echo ""
echo "✅ Piano Coach is running!"
echo "   Open http://localhost:5173 in your browser."
echo ""
echo "   Run ./stop.sh to stop."
