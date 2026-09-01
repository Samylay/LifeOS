// Server-side Enable Banking client, offline-testable (ROADMAP T68).
// Enable Banking replaces GoCardless Bank Account Data (see T67 — GoCardless
// closed to individual signups). Unlike Strava/Google Calendar there is no
// refresh-token dance: every call authenticates with a short-lived (1h) app
// JWT, RS256-signed with our private key (`kid` = app id). Enable Banking
// does not host the consent UI itself, so *we* drive the redirect + session
// exchange (see T69 for where the session id gets persisted).
import crypto from "node:crypto";

const API_BASE = "https://api.enablebanking.com";
const ISSUER = "enablebanking.com";
const AUDIENCE = "api.enablebanking.com";

/**
 * The private key reaches the container as base64 in `app/.env`, because
 * `env_file:` carries strings and the key is a file (MAP Q5, option (a) —
 * chosen 2026-08-15 so no docker-compose change and no infra commit was
 * needed). `ENABLE_BANKING_PRIVATE_KEY` stays supported for a raw PEM.
 */
function privateKeyPem(): string | undefined {
  const raw = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (raw) return raw;
  const b64 = process.env.ENABLE_BANKING_PRIVATE_KEY_B64;
  return b64 ? Buffer.from(b64, "base64").toString("utf8") : undefined;
}

export function isEnableBankingConfigured(): boolean {
  return Boolean(process.env.ENABLE_BANKING_APP_ID && privateKeyPem());
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export interface EnableBankingJwtClaims {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/**
 * Signs a fresh Enable Banking app JWT. Exported so tests can verify the
 * exact header/claim shape against a throwaway keypair without touching env
 * vars or the real .pem. `now` is injectable for deterministic exp checks.
 */
export function signEnableBankingJwt(appId: string, privateKeyPem: string, now: number = Date.now()): string {
  const header = { typ: "JWT", alg: "RS256", kid: appId };
  const iat = Math.floor(now / 1000);
  const claims: EnableBankingJwtClaims = { iss: ISSUER, aud: AUDIENCE, iat, exp: iat + 3600 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

function enableBankingJwt(): string | null {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKey = privateKeyPem();
  if (!appId || !privateKey) return null;
  return signEnableBankingJwt(appId, privateKey);
}

// Injectable so tests never hit the network — default is the real fetch.
export type EnableBankingTransport = typeof fetch;

async function call<T>(
  transport: EnableBankingTransport,
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const jwt = enableBankingJwt();
  if (!jwt) return null;

  let r: Response;
  try {
    r = await transport(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error(`[enable-banking] ${path} network error:`, e instanceof Error ? e.message : e);
    return null;
  }
  if (!r.ok) {
    // Enable Banking's rejection reason is the only way to tell a bad bank name
    // from a non-whitelisted redirect URL. Never logs the JWT or the auth code.
    const detail = await r.text().catch(() => "");
    console.error(`[enable-banking] ${path} -> ${r.status} ${detail.slice(0, 500)}`);
    return null;
  }
  return (await r.json()) as T;
}

export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
}

/** (b) List banks (ASPSPs) available in a country, e.g. "FR". */
export async function listAspsps(country: string, transport: EnableBankingTransport = fetch): Promise<Aspsp[] | null> {
  const body = await call<{ aspsps: Aspsp[] }>(transport, `/aspsps?country=${encodeURIComponent(country)}`);
  return body?.aspsps ?? null;
}

export interface StartAuthParams {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;
  validUntilIso: string;
}

/** (c) Start the bank-auth consent flow; returns the URL to redirect the user to. */
export async function startAuth(
  params: StartAuthParams,
  transport: EnableBankingTransport = fetch
): Promise<string | null> {
  const body = await call<{ url: string }>(transport, "/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: params.validUntilIso },
      aspsp: { name: params.aspspName, country: params.aspspCountry },
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: "personal",
    }),
  });
  return body?.url ?? null;
}

export interface BankSession {
  sessionId: string;
  accounts: string[];
  /** The full account objects, keyed by uid — kept for `bank_accounts.raw_json`. */
  accountsRaw: Record<string, unknown>;
  aspspName?: string;
  aspspCountry?: string;
  validUntil?: string;
}

interface RawSessionBody {
  session_id: string;
  // Live Enable Banking returns account OBJECTS here; older fixtures assumed
  // bare uid strings. Both shapes are accepted — the live one is what broke
  // the first real consent (an object bound straight into SQLite).
  accounts: Array<string | { uid?: string; account_uid?: string }>;
  aspsp?: { name?: string; country?: string };
  access?: { valid_until?: string };
}

/** (d) Exchange the consent-redirect `code` for a session id + account uids. */
export async function exchangeCode(code: string, transport: EnableBankingTransport = fetch): Promise<BankSession | null> {
  const body = await call<RawSessionBody>(transport, "/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!body) return null;

  const accounts: string[] = [];
  const accountsRaw: Record<string, unknown> = {};
  for (const a of body.accounts ?? []) {
    const uid = typeof a === "string" ? a : (a?.uid ?? a?.account_uid);
    if (!uid) continue;
    accounts.push(uid);
    if (typeof a !== "string") accountsRaw[uid] = a;
  }

  return {
    sessionId: body.session_id,
    accounts,
    accountsRaw,
    aspspName: body.aspsp?.name,
    aspspCountry: body.aspsp?.country,
    validUntil: body.access?.valid_until,
  };
}

export interface BankBalance {
  balanceAmount: string;
  balanceCurrency: string;
  balanceType?: string;
}

/** Current balance(s) for one account uid — used by the connected-accounts panel (T71). */
export async function getBalances(
  accountUid: string,
  transport: EnableBankingTransport = fetch
): Promise<BankBalance[] | null> {
  const body = await call<{
    balances: Array<{ balance_amount: { amount: string; currency: string }; balance_type?: string }>;
  }>(transport, `/accounts/${encodeURIComponent(accountUid)}/balances`);
  if (!body) return null;
  return body.balances.map((b) => ({
    balanceAmount: b.balance_amount.amount,
    balanceCurrency: b.balance_amount.currency,
    balanceType: b.balance_type,
  }));
}

export interface BankTransaction {
  transactionId: string;
  bookingDate?: string;
  valueDate?: string;
  amount: string;
  currency: string;
  creditorName?: string;
  debtorName?: string;
  remittanceInformation?: string[];
  raw: unknown;
}

/**
 * Dedup key for a transaction. Société Générale returns `transaction_id: null`
 * on every row (only `entry_reference`), and a NULL primary key does not
 * conflict in SQLite — so without this, every re-sync would duplicate the whole
 * history. Falls back through the bank's own identifiers, then to a hash of the
 * fields that identify a movement of money.
 */
export function transactionKey(
  accountUid: string,
  t: {
    transaction_id?: string | null;
    entry_reference?: string | null;
    reference_number?: string | null;
    booking_date?: string;
    value_date?: string;
    transaction_amount?: { amount?: string; currency?: string };
    credit_debit_indicator?: string;
    remittance_information?: string[];
  }
): string {
  if (t.transaction_id) return t.transaction_id;
  if (t.entry_reference) return `${accountUid}:${t.entry_reference}`;
  if (t.reference_number) return `${accountUid}:ref:${t.reference_number}`;
  const parts = [
    accountUid,
    t.booking_date ?? "",
    t.value_date ?? "",
    t.transaction_amount?.amount ?? "",
    t.transaction_amount?.currency ?? "",
    t.credit_debit_indicator ?? "",
    (t.remittance_information ?? []).join("|"),
  ].join("\u0000");
  return `${accountUid}:h:${crypto.createHash("sha256").update(parts).digest("hex").slice(0, 32)}`;
}

/** (e) Transactions for one account uid. `continuationKey` pages through history. */
export async function getTransactions(
  accountUid: string,
  continuationKey?: string,
  transport: EnableBankingTransport = fetch
): Promise<{ transactions: BankTransaction[]; continuationKey?: string } | null> {
  const qs = continuationKey ? `?continuation_key=${encodeURIComponent(continuationKey)}` : "";
  const body = await call<{
    transactions: Array<{
      transaction_id: string | null;
      entry_reference?: string | null;
      reference_number?: string | null;
      credit_debit_indicator?: string;
      booking_date?: string;
      value_date?: string;
      transaction_amount: { amount: string; currency: string };
      creditor?: { name?: string };
      debtor?: { name?: string };
      remittance_information?: string[];
    }>;
    continuation_key?: string;
  }>(transport, `/accounts/${encodeURIComponent(accountUid)}/transactions${qs}`);
  if (!body) return null;
  return {
    transactions: body.transactions.map((t) => ({
      transactionId: transactionKey(accountUid, t),
      bookingDate: t.booking_date,
      valueDate: t.value_date,
      amount: t.transaction_amount.amount,
      currency: t.transaction_amount.currency,
      creditorName: t.creditor?.name,
      debtorName: t.debtor?.name,
      remittanceInformation: t.remittance_information,
      raw: t,
    })),
    continuationKey: body.continuation_key,
  };
}
