// Finance tracker — pure logic layer (no React, no DB, no network).
//
// Manual-first by design. The Enable Banking hookup (ROADMAP T67–T72) is still
// gated on Samy registering the app, and a tracker that only works after a bank
// consent lands is a tracker that never gets used. So the model here is a
// hand-kept list of *flows* — his rentrées/sorties — and every number on the
// surface is derived from it. When the aggregator lands it becomes a second
// writer into the same shape, not a rewrite.
//
// One flow = one recurring or one-off movement of money. Kind is the axis that
// matters for behaviour, which is the whole point of the section:
//   fixed    — recurring and hard to cancel this month (rent, phone, insurance)
//   sub      — recurring and cancellable (Netflix, gym, Claude Max)
//   variable — everything discretionary (groceries, going out, one-offs)

export type FlowDirection = "in" | "out";
export type FlowCadence = "weekly" | "monthly" | "quarterly" | "yearly" | "oneoff";
export type FlowKind = "fixed" | "sub" | "variable";

export interface FinanceFlow {
  id: string;
  label: string;
  /** Always positive. Direction carries the sign. */
  amount: number;
  direction: FlowDirection;
  cadence: FlowCadence;
  kind: FlowKind;
  /** Still being paid for, no longer used. Drives the "cancel this" list. */
  dormant?: boolean;
  note?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export type FinanceFlowDraft = Omit<FinanceFlow, "id" | "createdAt" | "updatedAt">;

const PER_MONTH: Record<FlowCadence, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
  // One-offs are real money but not run-rate. Counting them into a monthly
  // figure makes the number lie in both directions depending on when you look.
  oneoff: 0,
};

export const KIND_LABEL: Record<FlowKind, string> = {
  fixed: "Fixed",
  sub: "Subscription",
  variable: "Variable",
};

export const CADENCE_LABEL: Record<FlowCadence, string> = {
  weekly: "per week",
  monthly: "per month",
  quarterly: "per quarter",
  yearly: "per year",
  oneoff: "one-off",
};

/** What this flow costs (or brings in) in an average month. */
export function monthlyAmount(flow: Pick<FinanceFlow, "amount" | "cadence">): number {
  return flow.amount * PER_MONTH[flow.cadence];
}

/** What this flow costs (or brings in) over a year. One-offs count once. */
export function yearlyAmount(flow: Pick<FinanceFlow, "amount" | "cadence">): number {
  if (flow.cadence === "oneoff") return flow.amount;
  return monthlyAmount(flow) * 12;
}

export interface FinanceTotals {
  monthlyIn: number;
  monthlyOut: number;
  /** monthlyIn - monthlyOut. Negative means the month does not close. */
  monthlyLeft: number;
  /** Recurring outgoings only, split by kind. */
  monthlyFixed: number;
  monthlySubs: number;
  monthlyVariable: number;
  /** Yearly cost of every subscription flagged dormant. */
  dormantYearly: number;
}

export function computeTotals(flows: FinanceFlow[]): FinanceTotals {
  const t: FinanceTotals = {
    monthlyIn: 0,
    monthlyOut: 0,
    monthlyLeft: 0,
    monthlyFixed: 0,
    monthlySubs: 0,
    monthlyVariable: 0,
    dormantYearly: 0,
  };

  for (const flow of flows) {
    const m = monthlyAmount(flow);
    if (flow.direction === "in") {
      t.monthlyIn += m;
      continue;
    }
    t.monthlyOut += m;
    if (flow.kind === "fixed") t.monthlyFixed += m;
    else if (flow.kind === "sub") t.monthlySubs += m;
    else t.monthlyVariable += m;
    if (flow.dormant) t.dormantYearly += yearlyAmount(flow);
  }

  t.monthlyLeft = t.monthlyIn - t.monthlyOut;
  return t;
}

/** Cancellable recurring outgoings, dearest first. Dormant ones float to the top. */
export function subscriptions(flows: FinanceFlow[]): FinanceFlow[] {
  return flows
    .filter((f) => f.direction === "out" && f.kind === "sub" && f.cadence !== "oneoff")
    .sort((a, b) => {
      if (Boolean(a.dormant) !== Boolean(b.dormant)) return a.dormant ? -1 : 1;
      return monthlyAmount(b) - monthlyAmount(a);
    });
}

export interface SpendSlice {
  kind: FlowKind;
  label: string;
  monthly: number;
  /** 0–1 share of total monthly outgoings. */
  share: number;
}

/** Where the money goes, by kind. The habits view is built on this. */
export function spendByKind(flows: FinanceFlow[]): SpendSlice[] {
  const t = computeTotals(flows);
  const total = t.monthlyOut || 1;
  const slices: SpendSlice[] = [
    { kind: "fixed", label: KIND_LABEL.fixed, monthly: t.monthlyFixed, share: t.monthlyFixed / total },
    { kind: "sub", label: "Subscriptions", monthly: t.monthlySubs, share: t.monthlySubs / total },
    { kind: "variable", label: KIND_LABEL.variable, monthly: t.monthlyVariable, share: t.monthlyVariable / total },
  ];
  return slices.filter((s) => s.monthly > 0).sort((a, b) => b.monthly - a.monthly);
}

export function formatEuro(value: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? Math.abs(value) < 100;
  return `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })} €`;
}

/**
 * Behaviour sentences, not accounting. Deterministic on purpose — the LLM pass
 * (ROADMAP T70) reads a real transaction corpus and does not exist yet, and a
 * habits panel that renders nothing until then is a dead panel.
 *
 * Capped at 3: he has ADHD and a fourth line is a line that does not get read.
 */
export function habitLines(flows: FinanceFlow[]): string[] {
  if (flows.length === 0) return [];
  const t = computeTotals(flows);
  const lines: string[] = [];

  if (t.monthlyOut > 0) {
    const biggest = spendByKind(flows)[0];
    if (biggest && biggest.share >= 0.4) {
      lines.push(
        `${Math.round(biggest.share * 100)}% of what you spend is ${biggest.label.toLowerCase()}, ${formatEuro(biggest.monthly)} a month.`
      );
    }
  }

  const subs = subscriptions(flows);
  if (subs.length > 0) {
    const subsYearly = subs.reduce((sum, f) => sum + yearlyAmount(f), 0);
    lines.push(
      `${subs.length} subscription${subs.length > 1 ? "s" : ""} costing ${formatEuro(subsYearly, { decimals: false })} a year.`
    );
  }

  const dormant = subs.filter((f) => f.dormant);
  if (dormant.length > 0) {
    lines.push(
      `${formatEuro(t.dormantYearly, { decimals: false })} a year goes to ${dormant.length} thing${dormant.length > 1 ? "s" : ""} you marked unused. Cancel ${dormant[0].label} first.`
    );
  } else if (t.monthlyLeft < 0) {
    lines.push(`You are ${formatEuro(-t.monthlyLeft)} short each month. Fixed costs are ${formatEuro(t.monthlyFixed)}.`);
  } else if (t.monthlyIn > 0) {
    const perDay = t.monthlyLeft / 30;
    lines.push(`${formatEuro(t.monthlyLeft)} left over a month, ${formatEuro(perDay)} a day.`);
  }

  return lines.slice(0, 3);
}

// --- Paste parser ------------------------------------------------------------
// The entry cost has to be near zero or the list never lands. He pastes his
// rentrées/sorties as-is, one per line, in French or English, and gets rows he
// can retag with one tap. Anything unparseable is reported, never dropped
// silently.

const CADENCE_PATTERNS: [RegExp, FlowCadence][] = [
  [/\/\s*sem\b|\bhebdo\w*|\bweekly\b|\bper week\b|\/\s*w\b/i, "weekly"],
  [/\/\s*trim\w*|\btrimestriel\w*|\bquarterly\b|\/\s*q\b/i, "quarterly"],
  [/\/\s*an\b|\bannuel\w*|\byearly\b|\bannual\w*|\bper year\b|\/\s*y(?:r)?\b/i, "yearly"],
  [/\/\s*mois\b|\bmensuel\w*|\bmonthly\b|\bper month\b|\/\s*m(?:o)?\b/i, "monthly"],
  [/\bponctuel\w*|\bone-?off\b|\bone ?time\b|\bunique\b/i, "oneoff"],
];

const INCOME_WORDS = /\brentr[ée]e?s?\b|\brevenu\w*|\bsalaire\b|\bbourse\b|\bincome\b|\bsalary\b|\bpaie\b|\bapl\b|\bcaf\b|\baide\w*\b/i;
const DORMANT_WORDS = /\bdormant\b|\binutilis[ée]\w*|\bunused\b|\bpas utilis[ée]\w*|\bjamais utilis[ée]\w*/i;

const FIXED_WORDS = /\bloyer\b|\brent\b|\bcharges?\b|\bassurance\w*|\binsurance\b|\bmutuelle\b|\bforfait\b|\bmobile\b|\bt[ée]l[ée]phone\b|\bphone\b|\binternet\b|\bbox\b|\b[ée]lectricit[ée]\b|\belectricity\b|\bnavigo\b|\bimagine ?r\b|\btransport\b|\bpr[êe]t\b|\bloan\b|\bcr[ée]dit\b|\bscolarit[ée]\b|\btuition\b|\b[ée]pita\b/i;
const SUB_WORDS = /\bnetflix\b|\bspotify\b|\byoutube\b|\bprime\b|\bdisney\b|\bcrunchyroll\b|\bgithub\b|\bclaude\b|\bchatgpt\b|\bopenai\b|\bnotion\b|\bfigma\b|\bicloud\b|\bgoogle one\b|\bdropbox\b|\badobe\b|\bsalle\b|\bgym\b|\bfitness\b|\bbasic ?fit\b|\bmusculation\b|\bvpn\b|\bdomaine\b|\bdomain\b|\bhosting\b|\bh[ée]bergement\b|\babonnement\b|\bsubscription\b/i;
const VARIABLE_WORDS = /\bcourses\b|\bgroceries\b|\bresto\w*|\brestaurant\w*|\bbouffe\b|\bfood\b|\bcaf[ée]\b|\bcoffee\b|\bsorties?\b|\bgoing out\b|\bbar\b|\bshopping\b|\bv[êe]tements\b|\bclothes\b|\buber\b|\bdeliveroo\b|\bloisirs?\b|\bfun\b/i;

/** "13,49" / "13.49" / "1 250" / "€25" / "25€" — first money-looking token wins. */
const AMOUNT_RE = /(-?\d[\d  ]*(?:[.,]\d{1,2})?)/;

export interface ParsedLine {
  raw: string;
  flow?: FinanceFlowDraft;
  error?: string;
}

function inferKind(label: string, direction: FlowDirection, cadence: FlowCadence): FlowKind {
  if (direction === "in") return "fixed";
  if (FIXED_WORDS.test(label)) return "fixed";
  if (SUB_WORDS.test(label)) return "sub";
  if (VARIABLE_WORDS.test(label)) return "variable";
  // Unknown recurring outgoing is far more often a subscription than not, and
  // the subscriptions list is the one he is meant to prune. Erring that way
  // puts it in front of him; erring the other way hides it.
  return cadence === "oneoff" ? "variable" : "sub";
}

/**
 * Parse one pasted line into a draft flow.
 *
 * Accepts, in any order: a label, an amount, an optional cadence marker, an
 * optional `+` (income) and an optional dormant marker. A leading `-` or a
 * bare amount is an outgoing, because a rentrées/sorties list is mostly sorties.
 */
export function parseFlowLine(raw: string): ParsedLine {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return { raw, error: "skipped" };

  const match = line.match(AMOUNT_RE);
  if (!match) return { raw, error: "no amount found" };

  const numeric = Number(match[1].replace(/[  ]/g, "").replace(",", "."));
  if (!Number.isFinite(numeric) || numeric === 0) return { raw, error: "amount is not a number" };

  let cadence: FlowCadence = "monthly";
  for (const [pattern, value] of CADENCE_PATTERNS) {
    if (pattern.test(line)) {
      cadence = value;
      break;
    }
  }

  // Sign wins over keywords: an explicit "-" on a line mentioning "salaire"
  // is still money leaving.
  const signed = /(^|\s)\+/.test(line.slice(0, match.index ?? 0) + match[1]);
  const negative = numeric < 0 || /(^|\s)-/.test(match[1]);
  const direction: FlowDirection = negative ? "out" : signed || INCOME_WORDS.test(line) ? "in" : "out";

  // Strip the amount, the cadence marker and every flag out of the label.
  let label = line
    .replace(match[0], " ")
    .replace(/[€]|\beur\b|\beuros?\b/gi, " ")
    .replace(DORMANT_WORDS, " ");
  for (const [pattern] of CADENCE_PATTERNS) label = label.replace(pattern, " ");
  label = label
    .replace(/[\s:;,\-–—+/|]+$/g, "")
    .replace(/^[\s:;,\-–—+/|]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!label) return { raw, error: "no label found" };

  const flow: FinanceFlowDraft = {
    label,
    amount: Math.abs(numeric),
    direction,
    cadence,
    kind: inferKind(label, direction, cadence),
  };
  if (DORMANT_WORDS.test(line)) flow.dormant = true;

  return { raw, flow };
}

export function parseFlowList(text: string): ParsedLine[] {
  return text
    .split("\n")
    .map((l) => parseFlowLine(l))
    .filter((p) => p.error !== "skipped");
}
