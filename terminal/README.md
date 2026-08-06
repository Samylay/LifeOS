# LifeOS web terminal (ttyd)

Full PTY shell into the homelab host, reached from LifeOS `/terminal`. Built
2026-07-25 after a remote-control outage (Claude Code's OAuth session died,
only fix path was SSH from a laptop) — this closes that gap from a phone.

## What it is

- `ttyd` (already installed at `~/.local/bin/ttyd`) runs as user `quorky`
  (NOT inside the LifeOS container — the container runs as root with
  `docker.sock` mounted, so a shell in there is a trivial host-root escape).
- **Two systemd units, same tmux session:**
  - `ttyd-homelab.service` — bound to `127.0.0.1:7681`, reached via
    `tailscale serve --https=8444` (`https://<magicdns-name>:8444`).
    Works from any tailnet device where MagicDNS resolves.
  - `ttyd-homelab-lan.service` — bound directly to the tailscale interface
    IP (`<tailnet-ip>:7681`, plain HTTP). This is the one LifeOS's
    `/terminal` page actually links to, because Samy's phone has "Use
    Tailscale DNS" off (carrier DNS conflict) and never resolves the
    `ts.net` name — same reason LifeOS itself and `PAGER_CLICK_URL` use the
    raw IP.
  - Both run `tmux new-session -A -s homelab`, so either path attaches the
    same shell — reconnecting from a phone resumes state, not a fresh shell.
- LifeOS's `/terminal` page is a plain link (`target="_blank"`), not an
  iframe — mobile browsers suppress the native basic-auth prompt for a
  cross-origin resource loaded in an iframe, so an auth-gated ttyd would
  just render blank there. Top-level navigation doesn't have that
  restriction.
- **Auth: NONE** (Samy's explicit call, 2026-07-25 — dropped ttyd's own
  basic-auth prompt for zero-friction phone access). The tailnet boundary is
  the only gate: same trust model as n8n, LifeOS itself, and the pager, none
  of which have an app-level login either. Concretely: **anyone who can
  reach `<tailnet-ip>:7681` or the tailnet-serve HTTPS path gets an
  unauthenticated root-capable shell, no second factor.**

## Setup

Endpoints are env vars, not committed values: `TAILNET_IP` and `TAILNET_HOST`
live in `~/.config/homelab/secrets.env` (the lan unit loads it via
`EnvironmentFile=`).

```
sudo cp ~/apps/lifeos/terminal/ttyd-homelab.service /etc/systemd/system/
sudo cp ~/apps/lifeos/terminal/ttyd-homelab-lan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ttyd-homelab
sudo systemctl enable --now ttyd-homelab-lan
sudo tailscale serve --bg --https=8444 127.0.0.1:7681
```

Verify: `systemctl is-active ttyd-homelab ttyd-homelab-lan` should both say
`active`, and `curl -o /dev/null -w '%{http_code}' http://<tailnet-ip>:7681/`
should return `200` (no auth challenge).

## Restoring a password

Add `-c "$TTYD_AUTH"` back into each unit's `ExecStart` (right after `-i
<bind-ip>`), add `EnvironmentFile=/home/quorky/.config/homelab/secrets.env`
back to `[Service]`, set `TTYD_AUTH=user:pass` in that file yourself (this
step needs a secret, so it's manual — same reason the initial setup did),
then `sudo systemctl daemon-reload && sudo systemctl restart ttyd-homelab
ttyd-homelab-lan`.

## Revoking access

`sudo systemctl stop ttyd-homelab ttyd-homelab-lan` kills the terminal
entirely (nothing else depends on it).
