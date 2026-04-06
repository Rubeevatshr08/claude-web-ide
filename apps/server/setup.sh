#!/bin/bash
set -e

echo "==> Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

echo "==> Scaffolding Next.js project..."
if [ ! -f /workspace/package.json ]; then
  npx create-next-app@latest /workspace \
    --typescript \
    --tailwind \
    --eslint \
    --app \
    --no-git \
    --yes
fi

echo "==> Installing workspace dependencies..."
cd /workspace && npm install

echo "==> Writing next.config.js with permissive dev origins..."
cat > /workspace/next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
};

export default nextConfig;
EOF

echo "==> Starting Next.js dev server..."
cd /workspace && npm run dev &

# Wait until port 3000 is accepting connections (up to 60s)
echo "==> Waiting for dev server to be ready..."
for i in $(seq 1 60); do
  if nc -z localhost 3000 2>/dev/null; then
    echo "==> Dev server is up!"
    break
  fi
  sleep 1
done

echo "SETUP_COMPLETE"
