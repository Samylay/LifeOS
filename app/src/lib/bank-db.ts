// Local SQLite store for Enable Banking data (ROADMAP T69), in the same DB
// file as the rest of LifeOS (see server-db.ts for the path resolution
// pattern; see strava-db.ts for the precedent this follows — raw tables, not
// the generic docs store, because transactions need dedup + range queries).
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_sessions (
      session_id TEXT PRIMARY KEY,
      aspsp_name TEXT,
      aspsp_country TEXT,
      accounts_json TEXT NOT NULL,
      valid_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      account_uid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_session ON bank_accounts(session_id);

    CREATE TABLE IF NOT EXISTS bank_transactions (
      transaction_id TEXT PRIMARY KEY,
      account_uid TEXT NOT NULL,
      booking_date TEXT,
      value_date TEXT,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      creditor_name TEXT,
      debtor_name TEXT,
      remittance_info_json TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_uid);
    CREATE INDEX IF NOT EXISTS idx_bank_transactions_booking_date ON bank_transactions(booking_date);

    CREATE TABLE IF NOT EXISTS bank_sync_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export function getBankDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  _db = db;
  return db;
}

export interface BankSessionRow {
  sessionId: string;
  aspspName: string | null;
  aspspCountry: string | null;
  accounts: string[];
  validUntil: string | null;
  createdAt: string;
}

/** Persists a session from `exchangeCode`, plus the account uids it covers. */
export function saveBankSession(session: {
  sessionId: string;
  accounts: string[];
  aspspName?: string;
  aspspCountry?: string;
  validUntil?: string;
  now?: string;
}): void {
  const db = getBankDb();
  const createdAt = session.now ?? new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO bank_sessions (session_id, aspsp_name, aspsp_country, accounts_json, valid_until, created_at)
       VALUES (@session_id, @aspsp_name, @aspsp_country, @accounts_json, @valid_until, @created_at)
       ON CONFLICT(session_id) DO UPDATE SET
         aspsp_name=excluded.aspsp_name,
         aspsp_country=excluded.aspsp_country,
         accounts_json=excluded.accounts_json,
         valid_until=excluded.valid_until`
    ).run({
      session_id: session.sessionId,
      aspsp_name: session.aspspName ?? null,
      aspsp_country: session.aspspCountry ?? null,
      accounts_json: JSON.stringify(session.accounts),
      valid_until: session.validUntil ?? null,
      created_at: createdAt,
    });
    const upsertAccount = db.prepare(
      `INSERT INTO bank_accounts (account_uid, session_id, raw_json)
       VALUES (@account_uid, @session_id, @raw_json)
       ON CONFLICT(account_uid) DO UPDATE SET session_id=excluded.session_id`
    );
    for (const accountUid of session.accounts) {
      upsertAccount.run({ account_uid: accountUid, session_id: session.sessionId, raw_json: null });
    }
  });
  tx();
}

export function listBankSessions(): BankSessionRow[] {
  const rows = getBankDb()
    .prepare(
      `SELECT session_id, aspsp_name, aspsp_country, accounts_json, valid_until, created_at FROM bank_sessions`
    )
    .all() as {
    session_id: string;
    aspsp_name: string | null;
    aspsp_country: string | null;
    accounts_json: string;
    valid_until: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    sessionId: r.session_id,
    aspspName: r.aspsp_name,
    aspspCountry: r.aspsp_country,
    accounts: JSON.parse(r.accounts_json) as string[],
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }));
}

export interface BankAccountRow {
  accountUid: string;
  sessionId: string;
}

export function listBankAccounts(): BankAccountRow[] {
  const rows = getBankDb().prepare(`SELECT account_uid, session_id FROM bank_accounts`).all() as {
    account_uid: string;
    session_id: string;
  }[];
  return rows.map((r) => ({ accountUid: r.account_uid, sessionId: r.session_id }));
}

export interface BankTransactionInput {
  transactionId: string;
  accountUid: string;
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
 * Inserts new transactions only — never updates an existing row. Dedup is on
 * `transaction_id` (the aggregator's own id), so a re-sync over already-seen
 * transactions inserts 0 rows and mutates nothing (T69 verify requirement).
 */
export function upsertBankTransactions(transactions: BankTransactionInput[], now?: string): number {
  if (transactions.length === 0) return 0;
  const db = getBankDb();
  const syncedAt = now ?? new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO bank_transactions (
       transaction_id, account_uid, booking_date, value_date, amount, currency,
       creditor_name, debtor_name, remittance_info_json, raw_json, synced_at
     ) VALUES (
       @transaction_id, @account_uid, @booking_date, @value_date, @amount, @currency,
       @creditor_name, @debtor_name, @remittance_info_json, @raw_json, @synced_at
     )`
  );
  const tx = db.transaction((items: BankTransactionInput[]) => {
    let inserted = 0;
    for (const t of items) {
      const result = insert.run({
        transaction_id: t.transactionId,
        account_uid: t.accountUid,
        booking_date: t.bookingDate ?? null,
        value_date: t.valueDate ?? null,
        amount: t.amount,
        currency: t.currency,
        creditor_name: t.creditorName ?? null,
        debtor_name: t.debtorName ?? null,
        remittance_info_json: t.remittanceInformation ? JSON.stringify(t.remittanceInformation) : null,
        raw_json: JSON.stringify(t.raw),
        synced_at: syncedAt,
      });
      inserted += result.changes;
    }
    return inserted;
  });
  return tx(transactions);
}

export function countBankTransactions(): number {
  const row = getBankDb().prepare("SELECT COUNT(*) as c FROM bank_transactions").get() as { c: number };
  return row.c;
}

export function getBankSyncState(key: string): string | null {
  const row = getBankDb().prepare("SELECT value FROM bank_sync_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setBankSyncState(key: string, value: string): void {
  getBankDb()
    .prepare(
      "INSERT INTO bank_sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    )
    .run(key, value);
}
