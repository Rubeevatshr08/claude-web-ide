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

# Install the Claude Code CLI.
RUN npm install -g @anthropic-ai/claude-code

# Copy the pre-scaffolded Next.js template.
COPY templates/nextjs-pages /home/user/workspace

WORKDIR /home/user/workspace

# Install dependencies in the sandbox.
RUN npm install

RUN chown -R 1000:1000 /home/user
