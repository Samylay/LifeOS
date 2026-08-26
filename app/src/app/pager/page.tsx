"use client";

// Pager — the homelab notification inbox (Telegram replacement). Messages
// arrive via POST /api/notify; streams mirror the homelab's four sources.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BellRing,
  Check,
  CheckCheck,
  Coffee,
  Inbox,
  Moon,
  MoreHorizontal,
  Settings,
  Siren,
  Trash2,
} from "lucide-react";
import {
  useNotifications,
  PAGER_STREAMS,
  type PagerStream,
  type PagerMessage,
} from "@/lib/use-notifications";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterBar, Page, PageHeader } from "@/components/ui/page";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";

const STREAM_META: Record<PagerStream, { label: string; icon: React.ReactNode }> = {
  alerts: { label: "Alerts", icon: <Siren size={12} /> },
  nightly: { label: "Nightly", icon: <Moon size={12} /> },
  weekly: { label: "Weekly", icon: <Coffee size={12} /> },
  capture: { label: "Capture", icon: <Inbox size={12} /> },
  system: { label: "System", icon: <Settings size={12} /> },
};

const SEVERITY_COLORS: Record<PagerMessage["severity"], string> = {
  page: "var(--destructive)",
  info: "var(--primary)",
  low: "var(--muted-foreground)",
};

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function isStream(v: string | null): v is PagerStream {
  return (PAGER_STREAMS as readonly string[]).includes(v ?? "");
}

function PagerInner() {
  const { messages, loading, markRead, markAllRead, ack, remove, undoRemove } =
    useNotifications();
  const params = useSearchParams();
  const [stream, setStream] = useState<PagerStream | "all">(() => {
    const s = params.get("stream");
    return isStream(s) ? s : "all";
  });

  const visible = stream === "all" ? messages : messages.filter((m) => m.stream === stream);
  const unreadCount = (s: PagerStream | "all") =>
    messages.filter((m) => !m.readAt && (s === "all" || m.stream === s)).length;

  const handleDelete = (id: string) => {
    remove(id);
    toast("Message deleted", {
      action: { label: "Undo", onClick: () => undoRemove(id) },
    });
  };

  // T37: on mobile the per-message actions (Ack / mark read / delete) live in
  // a Vaul bottom drawer instead of inline icon buttons; desktop keeps the
  // existing buttons pixel-identical.
  const isMobile = useIsMobile();
  const [actionsFor, setActionsFor] = useState<PagerMessage | null>(null);

  return (
    <Page narrow>
      <PageHeader
        title="Pager"
        icon={BellRing}
        actions={unreadCount(stream) > 0 ? (
          <Button
            onClick={() => markAllRead(visible)}
            size="sm"
            className="gap-1.5 text-sm font-medium active:scale-[0.97]"
          >
            <CheckCheck size={16} />
            Mark {unreadCount(stream)} read
          </Button>
        ) : undefined}
      />

      {/* Stream filter — empty streams hide (All always shows; the selected
          stream stays visible so the active filter can't strand itself) */}
      <FilterBar role="group" aria-label="Filter pager messages by stream">
        {(["all", ...PAGER_STREAMS] as const)
          .filter((s) => s === "all" || s === stream || messages.some((m) => m.stream === s))
          .map((s) => {
            const active = stream === s;
            const unread = unreadCount(s);
            return (
              <button
                key={s}
                onClick={() => setStream(s)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-[color,background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] ${
                  active
                    ? "bg-surface-3 text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s !== "all" && STREAM_META[s].icon}
                {s === "all" ? "All" : STREAM_META[s].label}
                {unread > 0 && <span className="font-semibold">{unread}</span>}
              </button>
            );
          })}
      </FilterBar>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground/70">
          Nothing here. The homelab is quiet.{" "}
          <Link href="/status" className="text-primary">
            Check status →
          </Link>
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => (
            <Card
              key={m.id}
              className="p-4 gap-0 flex-row items-start"
              // Read state is signalled by the dot + muted title below, NOT by
              // dimming the whole card: an `opacity` dim over the light ground
              // washed read messages out to ~2:1 (unreadable). Body text stays
              // at full muted-foreground so read messages remain legible.
            >
              {/* Unread = filled severity-colored dot; read = no dot (a hollow
                  border dot disappears on the dark ground). */}
              <span
                className="mt-1.5 mr-3 rounded-full shrink-0 h-2 w-2"
                style={{
                  background: m.readAt ? "transparent" : SEVERITY_COLORS[m.severity],
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground/70">
                    {STREAM_META[m.stream]?.label ?? m.stream} · {timeAgo(m.createdAt)}
                  </span>
                </div>
                {m.title && (
                  <p
                    className={`text-sm font-semibold mb-0.5 ${
                      m.readAt ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {m.title}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                  {m.body}
                </p>
                {m.path && !m.path.startsWith("/pager") && (
                  <Link
                    href={m.path}
                    onClick={() => !m.readAt && markRead(m.id)}
                    className="inline-flex items-center gap-1 mt-1.5 p-2 -m-2 text-xs font-medium text-primary active:scale-[0.97] transition-transform"
                  >
                    Open {m.path}
                    <ArrowUpRight size={12} />
                  </Link>
                )}
                {m.ackedAt ? (
                  <p className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground/70">
                    <Check size={12} /> Acked {timeAgo(m.ackedAt)} ago
                  </p>
                ) : (
                  !m.readAt &&
                  !isMobile &&
                  (m.actions?.length ?? 0) > 0 && (
                    <div className="mt-2">
                      <Button
                        onClick={() => ack(m)}
                        variant="outline"
                        size="sm"
                        className="text-xs font-medium active:scale-[0.97]"
                      >
                        Ack
                      </Button>
                    </div>
                  )
                )}
              </div>
              <div className="flex items-center shrink-0 -my-2 -mr-2">
                {isMobile ? (
                  <button
                    onClick={() => setActionsFor(m)}
                    className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground/70 transition-transform duration-150 active:scale-[0.97]"
                    title="Message actions"
                    aria-label="Message actions"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                ) : (
                  <>
                {!m.readAt && (
                  <button
                    onClick={() => markRead(m.id)}
                    className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground/70 transition-transform duration-150 active:scale-[0.97]"
                    title="Mark read"
                    aria-label="Mark read"
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(m.id)}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground/70 transition-transform duration-150 active:scale-[0.97]"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* T37 mobile: per-message actions drawer (vaul defaults — iOS curve +
          velocity dismissal). Motion inside is transform/opacity only. */}
      <Drawer open={actionsFor !== null} onOpenChange={(o) => !o && setActionsFor(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate text-left">
              {actionsFor?.title || actionsFor?.body}
            </DrawerTitle>
            <DrawerDescription className="text-left">
              {actionsFor ? STREAM_META[actionsFor.stream]?.label : ""}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {actionsFor && !actionsFor.ackedAt && !actionsFor.readAt && (actionsFor.actions?.length ?? 0) > 0 && (
              <Button
                onClick={() => {
                  ack(actionsFor);
                  setActionsFor(null);
                }}
                variant="outline"
                className="justify-start active:scale-[0.97] transition-transform duration-150"
              >
                <Check size={14} /> Acknowledge
              </Button>
            )}
            {actionsFor && !actionsFor.readAt && (
              <Button
                onClick={() => {
                  markRead(actionsFor.id);
                  setActionsFor(null);
                }}
                variant="outline"
                className="justify-start active:scale-[0.97] transition-transform duration-150"
              >
                <CheckCheck size={14} /> Mark read
              </Button>
            )}
            {actionsFor && (
              <Button
                onClick={() => {
                  handleDelete(actionsFor.id);
                  setActionsFor(null);
                }}
                variant="outline"
                className="justify-start text-destructive active:scale-[0.97] transition-transform duration-150"
              >
                <Trash2 size={14} /> Delete
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </Page>
  );
}

export default function PagerPage() {
  // useSearchParams needs a Suspense boundary for the static prerender.
  return (
    <Suspense fallback={null}>
      <PagerInner />
    </Suspense>
  );
}
