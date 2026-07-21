"use client";

// "Phone push" card for /settings — enable web-push on this device, list
// registered devices, and the "push normal severity too" preference.
// High-severity messages always push; normal only if the toggle is on and
// outside quiet hours (23:00-07:00 Asia/Tokyo); low never pushes.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Smartphone, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface DeviceSub {
  id: string;
  endpoint: string;
  userAgent: string;
  createdAt: { __date: string } | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Mac/i.test(ua)
        ? "macOS"
        : /Windows/i.test(ua)
          ? "Windows"
          : "Linux";
  const browser = /Firefox\//i.test(ua)
    ? "Firefox"
    : /Edg\//i.test(ua)
      ? "Edge"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "browser";
  return `${os} · ${browser}`;
}

export function PushSettings() {
  const { toast } = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceSub[]>([]);
  const [pushNormal, setPushNormal] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/push/subscribe");
      const data = await res.json();
      setDevices(Array.isArray(data.subs) ? data.subs : []);
    } catch {
      /* list stays as-is */
    }
  }, []);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setThisEndpoint(sub?.endpoint ?? null))
        .catch(() => {});
    }
    loadDevices();
    fetch("/api/data/users/local/settings/notify")
      .then((r) => r.json())
      .then((d) => setPushNormal(d?.doc?.pushNormal === true))
      .catch(() => {});
  }, [loadDevices]);

  const subscribedHere = thisEndpoint !== null && devices.some((d) => d.endpoint === thisEndpoint);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast("Notification permission denied — enable it in browser settings", "error");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/public-key")).json();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }),
      });
      if (!res.ok) throw new Error();
      setThisEndpoint(sub.endpoint);
      await loadDevices();
      toast("Push enabled on this device");
    } catch {
      toast("Could not enable push", "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setThisEndpoint(null);
      await loadDevices();
      toast("Push disabled on this device", "info");
    } catch {
      toast("Could not disable push", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (d: DeviceSub) => {
    // Optimistic: the row disappears instantly, the server catches up.
    setDevices((prev) => prev.filter((x) => x.id !== d.id));
    try {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: d.endpoint }),
      });
      if (d.endpoint === thisEndpoint) {
        const reg = await navigator.serviceWorker.ready;
        (await reg.pushManager.getSubscription())?.unsubscribe();
        setThisEndpoint(null);
      }
    } catch {
      loadDevices(); // restore truth on failure
    }
  };

  const togglePushNormal = async (v: boolean) => {
    setPushNormal(v); // optimistic
    try {
      await fetch("/api/data/users/local/settings/notify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { pushNormal: v }, merge: true }),
      });
    } catch {
      setPushNormal(!v);
      toast("Could not save", "error");
    }
  };

  return (
    <div className="rounded-lg bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
            <Smartphone size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Web push</p>
            <p className="text-xs text-muted-foreground">
              {supported === false
                ? "Not supported in this browser (on iOS, install the app to the home screen first)"
                : subscribedHere
                  ? "Enabled on this device — high-severity pages push even in quiet hours"
                  : "System notifications on this device, even with LifeOS closed"}
            </p>
          </div>
        </div>
        <Button
          variant={subscribedHere ? "outline" : "default"}
          size="sm"
          onClick={subscribedHere ? disable : enable}
          disabled={busy || supported === false}
          className="text-xs active:scale-[0.97]"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {subscribedHere ? "Disable on this device" : "Enable on this device"}
        </Button>
      </div>

      {devices.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {d.userAgent}
                {d.endpoint === thisEndpoint && (
                  <span className="ml-1.5 text-primary">this device</span>
                )}
                {d.createdAt?.__date && (
                  <span className="ml-1.5">
                    · {new Date(d.createdAt.__date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </span>
              <button
                onClick={() => removeDevice(d)}
                aria-label={`Remove ${d.userAgent}`}
                className="shrink-0 rounded p-1 text-muted-foreground transition-[color,transform] duration-150 hover:text-destructive active:scale-[0.9]"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-xs font-medium text-foreground">Push normal severity too</p>
          <p className="text-xs text-muted-foreground">
            Off = only high-severity pages push. Quiet hours (23:00–07:00 JST) still hold normal back.
          </p>
        </div>
        <Switch checked={pushNormal} onCheckedChange={togglePushNormal} aria-label="Push normal severity too" />
      </div>
    </div>
  );
}
