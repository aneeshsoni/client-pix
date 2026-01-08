# =============================================================================
# Next.js Frontend Dockerfile
# =============================================================================
# Multi-stage build for smaller production images
# =============================================================================

# --- Dependencies Stage ---
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# --- Builder Stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build argument for API URL (must be set at build time for Next.js)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# --- Production Stage ---
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"

# Run the application
CMD ["node", "server.js"]

