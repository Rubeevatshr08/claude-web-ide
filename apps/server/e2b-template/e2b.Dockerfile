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

# Copy the setup script.
COPY setup.sh /home/user/setup.sh
RUN chmod +x /home/user/setup.sh

WORKDIR /home/user/workspace

# Install dependencies in the sandbox.
RUN npm install --legacy-peer-deps

# Install tsx globally to run tools.
RUN npm install -g tsx opencode-ai

WORKDIR /home/user/workspace
RUN chown -R 1000:1000 /home/user

# Port 3000 for Next.js.
EXPOSE 3000
