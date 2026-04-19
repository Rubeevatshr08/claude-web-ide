#!/bin/bash
# set -e # Removed to allow debugging if one service fails

echo "==> Environment check:"
echo "PATH: $PATH"
echo "USER: $(whoami)"
echo "PWD: $(pwd)"

# Ensure we have the right path for global npm binaries
export PATH=$HOME/.local/bin:$PATH

# Start Next.js dev server on port 3000
echo "==> Starting Next.js dev server..."
cd /home/user/workspace
# CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=500 are needed for reliable reload in E2B
nohup env CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=500 npm run dev -- --hostname 0.0.0.0 --port 3000 > /home/user/next-dev.log 2>&1 &

# Wait until port 3000 is ready
echo "==> Waiting for port 3000 to be ready..."
# We wait for up to 60 seconds
for i in {1..60}; do
  if nc -z localhost 3000; then
    echo "==> Next.js is ready on port 3000!"
    exit 0
  fi
  sleep 1
  if (( i % 10 == 0 )); then
    echo "Still waiting... ($i/60)"
    echo "Port 3000: $(nc -z localhost 3000 && echo 'UP' || echo 'DOWN')"
  fi
done

echo "==> ERROR: Next.js failed to become ready in time."
echo "--- Next.js Log ---"
tail -n 20 /home/user/next-dev.log
exit 1
