"use client";

import { SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";

// Full PTY shell into the homelab host (ttyd, systemd units + setup in
// ~/apps/lifeos/terminal/). Built 2026-07-25 after a remote-control outage —
// Claude Code's OAuth session died and the only fix was SSH from a laptop.
// No auth of its own (Samy's explicit call, 2026-07-25, for zero-friction
// phone access) — the tailnet boundary is the only gate, same as n8n/LifeOS/
// pager. Concretely: anyone who can reach this URL gets a root-capable shell.
//
// NOT an iframe (found 2026-07-25): mobile browsers suppress the native
// basic-auth prompt for a cross-origin resource loaded inside an iframe, so
// the 401 challenge just renders blank with no way to enter the credential.
// Top-level navigation doesn't have that restriction, so this is a plain
// link that opens ttyd directly instead.
//
// Raw tailscale IP + http, NOT the ts.net hostname: Samy's phone has
// "Use Tailscale DNS" off (carrier DNS conflict), so the MagicDNS name never
// resolves there. Same reason LifeOS itself is dual-bound to
// 100.124.149.101 (docker-compose.yml) and PAGER_CLICK_URL uses the raw IP.
const TTYD_URL = "http://100.124.149.101:7681/";

export default function TerminalPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold text-foreground">Terminal</h1>
        <p className="text-sm text-muted-foreground">
          Host shell, persistent tmux session. Opens in a new tab, no login —
          the tailnet is the only gate.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Button asChild size="lg" className="active:scale-[0.97]">
          <a href={TTYD_URL} target="_blank" rel="noopener noreferrer">
            <SquareTerminal size={18} className="mr-2" />
            Open terminal
          </a>
        </Button>
      </div>
    </div>
  );
}
