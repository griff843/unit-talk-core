# Multi-stage Dockerfile for API
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/*/package*.json ./packages/*/
RUN npm ci --only=production

# Build stage
FROM base AS build
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/*/package*.json ./packages/*/
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM base AS runtime
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apiuser

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/*/dist ./packages/*/

USER apiuser

EXPOSE 3000

ENV NODE_ENV=production
ENV API_PORT=3000

CMD ["node", "apps/api/dist/index.js"]