FROM node:20-bookworm

ENV HOME=/home/user
ENV NPM_CONFIG_PREFIX=/home/user/.local
ENV PATH=/home/user/.local/bin:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/user/.local /home/user/workspace \
  && chown -R 1000:1000 /home/user

WORKDIR /home/user/workspace

# Install the CLI and scaffold the starter app once during template build.
RUN npm install -g @anthropic-ai/claude-code create-next-app@latest
RUN npx create-next-app@latest /home/user/workspace \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-git \
  --yes

COPY next.config.ts /home/user/workspace/next.config.ts

RUN npm install
RUN chown -R 1000:1000 /home/user
