import { bankTransactionIdentity, type BankTransactionLike } from "./finance-burn";
import { normalizeMerchantKey } from "./subscription-detector";

export const SPENDING_CATEGORIES = ["Groceries", "Eating out", "Transport", "Shopping", "Subscriptions", "Bills", "Health", "Travel", "Cash", "Other"] as const;
export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];
export interface MerchantLabel { label: string; category: SpendingCategory; }
export interface FinanceActivity {
  transactionId: string;
  merchantKey: string;
  label: string;
  bankLabel: string;
  category: SpendingCategory | "Income" | "Transfer" | "Needs review";
  corrected: boolean;
  amount: number;
  currency: string;
  date: string | null;
  accountUid: string;
  direction: "in" | "out" | null;
  isTransfer: boolean;
  included: boolean;
}

const CATEGORY_RULES: [SpendingCategory, RegExp][] = [
  ["Groceries", /\b(carrefour|lidl|aldi|auchan|monoprix|supermarche|supermarket|tesco|grocery|groceries)\b/i],
  ["Eating out", /\b(restaurant|cafe|coffee|boulangerie|bakery|deliveroo|uber\s*eats|mcdonald|burger|pizza)\b/i],
  ["Transport", /\b(sncf|ratp|uber|bolt|train|metro|parking|toll|transport)\b/i],
  ["Subscriptions", /\b(netflix|spotify|anthropic|openai|adobe|subscription|abonnement)\b/i],
  ["Bills", /\b(loyer|rent|electricity|edf|engie|insurance|assurance|cotisation|telecom|sfr|bouygues)\b/i],
  ["Health", /\b(pharmacie|pharmacy|medical|dentist|doctor|hospital)\b/i],
  ["Travel", /\b(hotel|airbnb|airline|ryanair|easyjet|booking\.com)\b/i],
  ["Cash", /\b(atm|retrait|cash withdrawal)\b/i],
  ["Shopping", /\b(amazon|ikea|decathlon|shopping|store)\b/i],
];

export function suggestedCategory(label: string): SpendingCategory {
  return CATEGORY_RULES.find(([, rule]) => rule.test(label))?.[0] ?? "Other";
}

export function financeActivity(
  transactions: (BankTransactionLike & { currency: string; accountUid: string })[],
  ownIdentifiers: string[] = [],
  labels: Record<string, MerchantLabel> = {},
): FinanceActivity[] {
  return transactions.map((transaction) => {
    const identity = bankTransactionIdentity(transaction, ownIdentifiers);
    const normalized = normalizeMerchantKey(identity.label);
    const merchantKey = identity.label === "Unknown merchant" || !normalized ? `transaction:${transaction.transactionId}` : normalized;
    const correction = labels[merchantKey];
    const category: FinanceActivity["category"] = !identity.included ? "Needs review" : identity.isTransfer ? "Transfer"
      : identity.direction === "in" ? "Income" : correction?.category ?? suggestedCategory(identity.label);
    return {
      transactionId: transaction.transactionId, merchantKey,
      bankLabel: identity.label, category,
      corrected: Boolean(correction), amount: Math.abs(Number(transaction.amount)), currency: transaction.currency,
      date: transaction.bookingDate, accountUid: transaction.accountUid, ...identity,
      // The bank identity determines amounts and direction; user labels only change display.
      label: correction?.label || identity.label,
    };
  }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.transactionId.localeCompare(b.transactionId));
}

export function formatMoney(amount: number, currency = "EUR"): string {
  if (!Number.isFinite(amount)) return "Amount unavailable";
  try { return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
}
