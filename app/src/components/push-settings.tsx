"use client";

// "Phone push" card for /settings — enable web-push on this device, list
// registered devices, and the "push normal severity too" preference.
// High-severity messages always push; normal only if the toggle is on and
// outside quiet hours (23:00-07:00 Asia/Tokyo); low never pushes.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Smartphone, X, BellRing } from "lucide-react";
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

/**
 * Turn a browser push error into something actionable. The messages browsers
 * raise here name their own internals, never the fix: Firefox says "Error
 * retrieving push subscription." when its push service is unreachable or
 * disabled (private window, dom.push off, a privacy extension, or a network
 * that blocks push.services.mozilla.com).
 */
function explainPushFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : "";
  if (/retrieving push subscription/i.test(raw)) {
    return `${raw} — Firefox could not reach its own push service. Check: not a Private window, dom.push.enabled and dom.push.connection.enabled true in about:config, and nothing on the network or in an extension blocking push.services.mozilla.com.`;
  }
  if (/push service|Registration failed/i.test(raw)) {
    return `${raw} — the browser reached LifeOS fine but its push service (Google FCM on Chrome) refused or was unreachable. This is a device/network problem, not a LifeOS one: try another network, and check no VPN, DNS filter or firewall is blocking fcm.googleapis.com.`;
  }
  if (name === "NotAllowedError") {
    return "The browser blocked the subscription — allow notifications for this site, then try again.";
  }
  if (name === "AbortError") {
    return `${raw} — the browser's push service refused the subscription. Try another browser to confirm it is not LifeOS.`;
  }
  return raw || "Unknown error.";
}

export function PushSettings() {
  const { toast } = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceSub[]>([]);
  const [pushNormal, setPushNormal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quiet, setQuiet] = useState({ start: "23:00", end: "07:00", tz: "Europe/Paris" });
  // Why enabling failed, kept on screen: a toast that vanishes is useless for
  // a permission/registration problem the user has to go fix in the browser.
  const [problem, setProblem] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/push/subscribe");
      const data = await res.json();
      setDevices(Array.isArray(data.subs) ? data.subs : []);
      if (data.quiet) setQuiet(data.quiet);
    } catch {
      /* list stays as-is */
    }
  }, []);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) {
      // Register on load, not only when Enable is clicked: `serviceWorker.ready`
      // never resolves while nothing is registered, which left this card
      // permanently showing "not enabled" on a device that already was.
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
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
    setProblem(null);
    try {
      if (!window.isSecureContext) {
        // Push needs HTTPS or localhost — hitting the tailnet IP over http is
        // the usual way this silently can't work.
        throw new Error("This page isn't a secure context. Open LifeOS over https (the tailnet hostname), not a bare IP.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          permission === "denied"
            ? "Notifications are blocked for this site. Allow them in the browser's site settings, then try again."
            : "Notification permission was dismissed — try again and choose Allow."
        );
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/public-key");
      if (!keyRes.ok) throw new Error("The server did not return a VAPID key.");
      const { publicKey } = await keyRes.json();
      const applicationServerKey = urlBase64ToUint8Array(publicKey) as BufferSource;
      const existing = await reg.pushManager.getSubscription();
      let sub: PushSubscription;
      try {
        sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
      } catch (err) {
        // A subscription left over from an older VAPID key can't be reused and
        // can't be re-subscribed over — drop it and take a fresh one.
        if (existing) {
          await existing.unsubscribe().catch(() => {});
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        } else {
          throw err;
        }
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }),
      });
      if (!res.ok) throw new Error(`The server rejected the subscription (${res.status}).`);
      setThisEndpoint(sub.endpoint);
      await loadDevices();
      toast("Push enabled on this device");
    } catch (e) {
      setProblem(explainPushFailure(e));
      toast("Could not enable push", "error");
    } finally {
      setBusy(false);
    }
  };

  /** Round-trips a real push through the gateway, so a failure is visible here. */
  const sendTest = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `\u{1F6A8} Test push ${new Date().toLocaleTimeString("fr-FR")}`,
          title: "LifeOS test",
          severity: "page",
        }),
      });
      const body = await res.json();
      if (body.push === "sent") {
        toast("Test push sent — it should appear in a second");
      } else {
        const why =
          body.push === "no-subs"
            ? "No device is subscribed — enable push on this device first."
            : `The gateway did not push it (${body.push}).`;
        setProblem(why);
        toast(why, "error");
      }
    } catch {
      const why = "Could not reach the notification gateway.";
      setProblem(why);
      toast(why, "error");
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
          disabled={busy || supported !== true}
          className="text-xs active:scale-[0.97]"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {subscribedHere ? "Disable on this device" : "Enable on this device"}
        </Button>
      </div>

      {problem && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">
          {problem}
        </p>
      )}

      {devices.length > 0 && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={sendTest}
            disabled={busy}
            className="gap-1.5 text-xs active:scale-[0.97]"
          >
            <BellRing size={12} /> Send a test push
          </Button>
        </div>
      )}

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
            {`${pushNormal ? "Right now: normal + high push" : "Right now: high-severity only"} · quiet hours ${quiet.start}–${quiet.end} ${quiet.tz}`}
          </p>
        </div>
        <Switch checked={pushNormal} onCheckedChange={togglePushNormal} aria-label="Push normal severity too" />
      </div>
    </div>
  );
}
