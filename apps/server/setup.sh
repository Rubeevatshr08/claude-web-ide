#!/bin/bash
set -e

CLAUDE_PREFIX="/home/user/.local"
WORKSPACE_DIR="/home/user/workspace"
export NPM_CONFIG_PREFIX="$CLAUDE_PREFIX"
export PATH="$CLAUDE_PREFIX/bin:$PATH"

echo "==> Installing Claude Code CLI..."
if [ ! -x "$CLAUDE_PREFIX/bin/claude" ]; then
  npm install -g @anthropic-ai/claude-code
fi

echo "==> Scaffolding Next.js project..."
mkdir -p "$WORKSPACE_DIR"
if [ ! -f "$WORKSPACE_DIR/package.json" ]; then
  npx create-next-app@latest "$WORKSPACE_DIR" \
    --typescript \
    --tailwind \
    --eslint \
    --app \
    --no-git \
    --yes
fi

echo "==> Installing workspace dependencies..."
cd "$WORKSPACE_DIR" && npm install

echo "==> Writing next.config.js with permissive dev origins..."
cat > "$WORKSPACE_DIR/next.config.ts" << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev", "localhost", "127.0.0.1"],
};

export default nextConfig;
EOF

echo "==> Starting Next.js dev server..."
cd "$WORKSPACE_DIR"
nohup npm run dev -- --hostname 0.0.0.0 --port 3000 > "$WORKSPACE_DIR/.next-dev.log" 2>&1 &

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
