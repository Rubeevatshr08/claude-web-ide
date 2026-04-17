FROM node:20-bookworm

ENV HOME=/home/user
ENV NPM_CONFIG_PREFIX=/home/user/.local
ENV PATH=/home/user/.local/bin:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates netcat-openbsd psmisc \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/user/.local /home/user/workspace \
  && chown -R 1000:1000 /home/user

WORKDIR /home/user/workspace

# Copy the pre-scaffolded Next.js template.
COPY templates/nextjs-pages /home/user/workspace

# Copy the Orchestrator.
COPY orchestrator /home/user/orchestrator

WORKDIR /home/user/workspace

# Install dependencies in the sandbox.
RUN npm install --legacy-peer-deps

# Install orchestrator dependencies.
WORKDIR /home/user/orchestrator
RUN npm install

# Install tsx globally to run the orchestrator.
RUN npm install -g tsx opencode-ai

WORKDIR /home/user/workspace
RUN chown -R 1000:1000 /home/user

# Port 8000 for Orchestrator, Port 3000 for Next.js.
EXPOSE 8000
EXPOSE 3000
