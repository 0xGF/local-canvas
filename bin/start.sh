#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Kill stale processes
for port in 3000 3001; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
    echo "Killed stale process on :$port"
  fi
done
sleep 1

# Build
echo "Building..."
npm run build

# Start test app
echo "Starting test app on :3000..."
cd test-app && npx vite --port 3000 &
cd "$DIR"

# Wait for test app
echo "Waiting for test app..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -H "Accept: text/html" http://localhost:3000/ 2>/dev/null; then
    echo "Test app ready"
    break
  fi
  sleep 0.5
done

# Start proxy (foreground — Ctrl+C kills everything)
echo "Starting editor on :3001..."
trap 'kill $(jobs -p) 2>/dev/null' EXIT
node dist/cli/index.js dev --root test-app
