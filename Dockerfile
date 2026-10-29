# Build stage for backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY backend/src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk add --no-cache ca-certificates curl

# Create non-root user
RUN addgroup -g 1001 -S vpnbot && \
    adduser -S vpnbot -u 1001 -G vpnbot

# Copy built files
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package*.json ./

# Drizzle migrations + config (required by `npm run migrate` in-container)
COPY backend/drizzle ./drizzle
COPY backend/drizzle.config.ts ./drizzle.config.ts

# Create directories
RUN mkdir -p /app/uploads /app/backups && \
    chown -R vpnbot:vpnbot /app

USER vpnbot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
