FROM node:20-slim

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/memory/package.json packages/memory/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/guardian/package.json packages/guardian/
COPY packages/execution/package.json packages/execution/
COPY packages/workspace/package.json packages/workspace/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

# Install dependencies and force rebuild native modules from source
RUN npm install --build-from-source

# Copy source
COPY . .

# Build
RUN npm run build:web

# Verify Node version matches the native module at build time
RUN node -e "require('better-sqlite3')" && echo "better-sqlite3 OK"

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "apps/web/dist/server/index.js"]
