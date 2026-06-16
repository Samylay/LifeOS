# syntax=docker/dockerfile:1

# ---- Builder: install deps (incl. native better-sqlite3) and build ----
FROM node:22-bookworm AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runner: minimal standalone server ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Bind to all interfaces so Docker port mapping works; data lives on a volume.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV LIFEOS_DB_PATH=/data/lifeos.db

RUN mkdir -p /data

# Next.js standalone output (server.js + traced node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Ensure the compiled native binary for better-sqlite3 is present.
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
