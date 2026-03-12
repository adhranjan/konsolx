# ----------------------------
# Stage 1: Builder
# ----------------------------
FROM node:20-bullseye AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    bash \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install all dependencies (including dev for building)
COPY package*.json ./
RUN yarn install --frozen-lockfile

# Copy source files
COPY . .

# Build frontend + backend
RUN yarn build

# ----------------------------
# Stage 2: Production
# ----------------------------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8012

# Install runtime tools (python3, bash)
RUN apk add --no-cache python3 bash git curl

# Copy built backend + frontend
COPY --from=builder /app/build ./build
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Install production dependencies
RUN yarn install --frozen-lockfile --production

EXPOSE 8012
CMD ["node", "build/server.js"]