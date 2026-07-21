// Web-push channel for the notification gateway.
//
// VAPID keys are generated ONCE on first use and stored in the live doc store
// (users/local/webPushConfig, doc "vapid") — never in git, never logged. The
// public key is served to the browser by GET /api/push/public-key; the private
// key never leaves this module.
//
// Subscriptions live in users/local/pushSubs. A send that fails with 404/410
// (expired) or a connection-level refusal prunes the dead subscription.
import webpush from "web-push";
import { createDoc, listDocs, getDoc, setDoc, deleteDoc } from "@/lib/server-db";

export const CONFIG_COLLECTION = "users/local/webPushConfig";
export const CONFIG_DOC_ID = "vapid";
export const SUBS_COLLECTION = "users/local/pushSubs";

const VAPID_SUBJECT = "mailto:layaida.samy@gmail.com";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Get the VAPID key pair, generating + persisting it on first call. */
export function getOrCreateVapidKeys(): VapidKeys {
  const doc = getDoc(CONFIG_COLLECTION, CONFIG_DOC_ID);
  if (doc && typeof doc.publicKey === "string" && typeof doc.privateKey === "string") {
    return { publicKey: doc.publicKey, privateKey: doc.privateKey };
  }
  const keys = webpush.generateVAPIDKeys();
  setDoc(CONFIG_COLLECTION, CONFIG_DOC_ID, {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    createdAt: { __date: new Date().toISOString() },
  });
  return keys;
}

export interface PushSub {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  createdAt?: { __date: string };
}

function isPushSub(d: Record<string, unknown>): d is Record<string, unknown> & PushSub {
  const keys = d.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  return (
    typeof d.endpoint === "string" &&
    Boolean(keys) &&
    typeof keys?.p256dh === "string" &&
    typeof keys?.auth === "string"
  );
}

export function listPushSubs(): PushSub[] {
  return listDocs(SUBS_COLLECTION).filter(isPushSub);
}

/** Upsert by endpoint (re-subscribing the same browser must not duplicate). */
export function savePushSub(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
}): string {
  const existing = listPushSubs().find((s) => s.endpoint === sub.endpoint);
  if (existing) {
    setDoc(SUBS_COLLECTION, existing.id, {
      endpoint: sub.endpoint,
      keys: sub.keys,
      userAgent: sub.userAgent,
      createdAt: existing.createdAt ?? { __date: new Date().toISOString() },
    });
    return existing.id;
  }
  return createDoc(SUBS_COLLECTION, {
    ...sub,
    createdAt: { __date: new Date().toISOString() },
  });
}

export function deletePushSubByEndpoint(endpoint: string): boolean {
  const existing = listPushSubs().find((s) => s.endpoint === endpoint);
  if (!existing) return false;
  deleteDoc(SUBS_COLLECTION, existing.id);
  return true;
}

/** Does this send failure mean the subscription is dead (prune it)? */
function isDeadSubError(err: unknown): boolean {
  const e = err as {
    statusCode?: number;
    code?: string;
    cause?: { code?: string };
    errors?: { code?: string }[];
  };
  if (e?.statusCode === 404 || e?.statusCode === 410) return true;
  const dead = new Set(["ECONNREFUSED", "ENOTFOUND", "EPROTO"]);
  const codes = [e?.code, e?.cause?.code, ...(e?.errors?.map((x) => x?.code) ?? [])];
  return codes.some((c) => c !== undefined && dead.has(c));
}

export interface PushSendResult {
  attempted: number;
  delivered: number;
  pruned: number;
  errors: number;
}

/**
 * Push a payload to every stored subscription. Dead endpoints (410/404 or
 * connection refused) are pruned. Never throws; never logs key material.
 */
export async function sendPushToAll(payload: {
  title: string;
  body: string;
  tag: string;
}): Promise<PushSendResult> {
  const subs = listPushSubs();
  const result: PushSendResult = { attempted: subs.length, delivered: 0, pruned: 0, errors: 0 };
  if (!subs.length) return result;

  const vapid = getOrCreateVapidKeys();
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          {
            vapidDetails: {
              subject: VAPID_SUBJECT,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
            TTL: 3600,
            timeout: 5000,
          }
        );
        result.delivered += 1;
      } catch (err) {
        if (isDeadSubError(err)) {
          deleteDoc(SUBS_COLLECTION, sub.id);
          result.pruned += 1;
        } else {
          result.errors += 1;
        }
      }
    })
  );
  return result;
}
