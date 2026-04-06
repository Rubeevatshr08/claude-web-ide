FROM node:20-alpine

WORKDIR /app

# Copy server package files
COPY apps/server/package*.json ./

RUN npm install

# Copy source
COPY apps/server/src ./src
COPY apps/server/tsconfig.json ./
COPY apps/server/setup.sh ./setup.sh

# Build TypeScript
RUN npx tsc

EXPOSE 8080

CMD ["node", "dist/index.js"]
