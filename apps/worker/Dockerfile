# Multi-stage Dockerfile for Worker
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY apps/worker/package*.json ./apps/worker/
COPY packages/*/package*.json ./packages/*/
RUN npm ci --only=production

# Build stage
FROM base AS build
COPY package*.json ./
COPY apps/worker/package*.json ./apps/worker/
COPY packages/*/package*.json ./packages/*/
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM base AS runtime
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/*/dist ./packages/*/

USER workeruser

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/worker.js"]