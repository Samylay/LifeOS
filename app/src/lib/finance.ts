export type FlowDirection = "in" | "out";
export type FlowCadence = "weekly" | "monthly" | "quarterly" | "yearly" | "oneoff";
export type FlowKind = "fixed" | "sub" | "variable";

const MONTHLY_FACTOR: Record<FlowCadence, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
  oneoff: 0,
};

export function monthlyAmount(flow: { amount: number; cadence: FlowCadence }): number {
  return flow.amount * MONTHLY_FACTOR[flow.cadence];
}

export function yearlyAmount(flow: { amount: number; cadence: FlowCadence }): number {
  return flow.cadence === "oneoff" ? flow.amount : monthlyAmount(flow) * 12;
}

export const KIND_LABEL: Record<FlowKind, string> = {
  fixed: "Fixed",
  sub: "Subscription",
  variable: "Variable",
};

export function formatEuro(value: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? Math.abs(value) < 100;
  return `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })} €`;
}

const FIXED_WORDS = /\bloyer\b|\brent\b|\bcharges?\b|\bassurance\w*|\binsurance\b|\bmutuelle\b|\bforfait\b|\bmobile\b|\bt[ée]l[ée]phone\b|\bphone\b|\binternet\b|\bbox\b|\b[ée]lectricit[ée]\b|\belectricity\b|\bnavigo\b|\bimagine ?r\b|\btransport\b|\bpr[êe]t\b|\bloan\b|\bcr[ée]dit\b|\bscolarit[ée]\b|\btuition\b|\b[ée]pita\b|\bcotisation\w*\b/i;
const SUB_WORDS = /\bnetflix\b|\bspotify\b|\byoutube\b|\bprime\b|\bdisney\b|\bcrunchyroll\b|\bgithub\b|\bclaude\b|\bchatgpt\b|\bopenai\b|\bnotion\b|\bfigma\b|\bicloud\b|\bgoogle one\b|\bapple\.com\b|\bdropbox\b|\badobe\b|\bsalle\b|\bgym\b|\bfitness\b|\bbasic ?fit\b|\bmusculation\b|\bvpn\b|\bdomaine\b|\bdomain\b|\bhosting\b|\bh[ée]bergement\b|\babonnement\b|\bsubscription\b/i;
const VARIABLE_WORDS = /\bcourses\b|\bgroceries\b|\bresto\w*|\brestaurant\w*|\bbouffe\b|\bfood\b|\bcaf[ée]\b|\bcoffee\b|\bsorties?\b|\bgoing out\b|\bbar\b|\bshopping\b|\bv[êe]tements\b|\bclothes\b|\buber\b|\bdeliveroo\b|\bloisirs?\b|\bfun\b/i;

/** A shared merchant-name hint, with no I/O or guessed default. */
export function keywordKind(label: string): FlowKind | null {
  if (FIXED_WORDS.test(label)) return "fixed";
  if (SUB_WORDS.test(label)) return "sub";
  if (VARIABLE_WORDS.test(label)) return "variable";
  return null;
}

export function inferKind(label: string, direction: FlowDirection, cadence: FlowCadence): FlowKind {
  if (direction === "in") return "fixed";
  return keywordKind(label) ?? (cadence === "oneoff" ? "variable" : "sub");
}
