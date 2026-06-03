# Konsolx: web UI + API + terminal WebSocket on port 8012.
# Host machine shells (USE_HOST_SHELL) require a compose override with
# privileged + pid: host — see docker-compose.yml.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# python3: needed at runtime for pty.spawn() shell trick.
# util-linux: provides nsenter for USE_HOST_SHELL=true (host PID namespace).
RUN apt-get update && apt-get install -y --no-install-recommends python3 util-linux lsof \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build

RUN mkdir -p /data

EXPOSE 8012
CMD ["node", "build/server.js"]
