// The one writable path in the finance vertical (ticket 04).
//
// A correction is stored against the normalized counterparty
// (`ClassificationOverrides`'s key in finance-burn.ts), never against a
// transaction or account row — so it survives every re-sync (upsertBankTransactions
// is dedup'd on transaction_id and never touches this table either way) and
// applies automatically to every future charge from the same counterparty.
//
// The shape is deliberately narrow: `setClassificationOverride` takes exactly
// (merchantKey, kind), and `FlowKind` is a closed three-value union. There is
// no parameter position an amount, a label, a date or a cadence could occupy
// — an override that could carry one of those is unrepresentable by this
// function's signature, not merely rejected by validation. The runtime guard
// below exists only as defense-in-depth for a caller that bypasses the type
// system (an untyped API body, for instance); it is not what makes the
// amount-carrying case impossible.
import { getBankDb } from "./bank-db";
import type { FlowKind } from "./finance";
import type { ClassificationOverrides } from "./finance-burn";

const VALID_KINDS: readonly FlowKind[] = ["fixed", "sub", "variable"];

function assertValidKind(kind: FlowKind): void {
  if (!(VALID_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`invalid classification override kind: ${String(kind)}`);
  }
}

/** Every stored correction, keyed by normalized counterparty. Empty object
 * (never null/undefined) when nothing has ever been corrected — the same
 * "no overrides" shape `classify`/`monthlyBurn`/`detectRecurring` already
 * default to. */
export function listClassificationOverrides(): ClassificationOverrides {
  const rows = getBankDb().prepare(`SELECT merchant_key, kind FROM finance_classification_overrides`).all() as {
    merchant_key: string;
    kind: string;
  }[];
  const overrides: ClassificationOverrides = {};
  for (const row of rows) {
    overrides[row.merchant_key] = row.kind as FlowKind;
  }
  return overrides;
}

/**
 * Sets (or replaces) the correction for one counterparty. Upsert on
 * `merchant_key`: correcting the same counterparty twice replaces the prior
 * correction rather than accumulating history — there is nothing to
 * reconcile, only the current classification.
 */
export function setClassificationOverride(merchantKey: string, kind: FlowKind, now?: string): void {
  assertValidKind(kind);
  const key = merchantKey.trim();
  if (!key) throw new Error("merchantKey must not be empty");
  getBankDb()
    .prepare(
      `INSERT INTO finance_classification_overrides (merchant_key, kind, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(merchant_key) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`
    )
    .run(key, kind, now ?? new Date().toISOString());
}

/**
 * Clears a correction, returning that counterparty to whatever `classify`
 * guesses on its own. A counterparty with no stored correction, or one that
 * no longer appears in any synced transaction, is a no-op either way — this
 * never throws on a key it doesn't recognise.
 */
export function clearClassificationOverride(merchantKey: string): void {
  getBankDb().prepare(`DELETE FROM finance_classification_overrides WHERE merchant_key = ?`).run(merchantKey.trim());
}
