# LifeOS App — Setup Guide

LifeOS is fully self-hosted: data lives in a local **SQLite** file and the AI
features run against a local **Ollama** instance. There are no cloud accounts,
no API keys, and no login (single-user).

## Prerequisites

- Node.js 20+ and npm (for local dev), or Docker + Docker Compose (to serve)
- [Ollama](https://ollama.com) running locally, with a tool-capable model pulled:
  ```bash
  ollama pull qwen2.5:7b
  ```

## Quick Start (local dev)

```bash
cd app
cp .env.local.example .env.local   # defaults are fine for local dev
npm install
npm run dev
```

The app runs at `http://localhost:3000`. Data is written to `app/data/lifeos.db`.

## Environment Variables

All optional — sensible defaults are baked in. See `.env.local.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `LIFEOS_DB_PATH` | `./data/lifeos.db` | SQLite database file location |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Model used for chat / parse / brief |

## Data Model

Data is stored exactly as it was under Firestore — a document store keyed by
collection path (`users/local/<collection>`) — but in a single SQLite table.
The `/api/data/[...path]` route provides generic CRUD; client hooks read via
fetch + light polling and write through the same endpoint. See
`architecture.md` and `firestore-schema.md` for the collection layout.

## Deployment (Docker, self-hosted on the homelab)

```bash
cd app
docker compose up -d --build
```

This builds a standalone Next.js image and runs it as the `lifeos` container:

- The SQLite database is persisted in the `lifeos-data` Docker volume (`/data`).
- The container reaches the host's Ollama via `host.docker.internal:11434`
  (configured with `extra_hosts: host-gateway` in `docker-compose.yml`).
- The port is bound to the **Tailscale interface IP** only
  (`100.124.149.101:3000`), so the app is reachable from every device on the
  tailnet but not from the LAN or the internet. Since there is no login, keep
  it tailnet-only.

Access it from any tailnet device at:

```
http://homelab.tail069527.ts.net:3000
```

### Optional: Tailscale Serve (HTTPS on 443)

For a clean `https://homelab.tail069527.ts.net` URL instead of `:3000`:

1. Enable HTTPS certificates for the tailnet in the Tailscale admin console
   (Settings → Features → HTTPS Certificates).
2. In `docker-compose.yml`, change the port binding back to
   `"127.0.0.1:3000:3000"` and `docker compose up -d`.
3. Run (needs root):
   ```bash
   sudo tailscale serve --bg 3000
   ```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (hot reload) |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
