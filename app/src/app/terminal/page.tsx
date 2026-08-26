"use client";

import { SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/page";

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
    <Page narrow>
      <PageHeader
        kicker="Utility"
        title="Terminal"
        description="Host shell and persistent tmux session. It opens in a new tab; the tailnet is the only gate."
        icon={SquareTerminal}
      />
      <div className="work-canvas flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
          <SquareTerminal size={24} />
        </div>
        <div>
          <p className="font-medium text-foreground">Homelab host shell</p>
          <p className="mt-1 text-sm text-muted-foreground">Opens outside LifeOS so browser authentication works reliably.</p>
        </div>
        <Button asChild size="lg">
          <a href={TTYD_URL} target="_blank" rel="noopener noreferrer">
            <SquareTerminal size={18} />
            Open terminal
          </a>
        </Button>
      </div>
    </Page>
  );
}
