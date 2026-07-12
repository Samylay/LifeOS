// PROTOTYPE — approved triage items joined with their generated adaptive
// view specs (users/local/adaptivePrototype, written by
// services/triage/adaptive-spec-prototype.py), plus the template BANK:
// seed shapes (code) merged with minted templates
// (users/local/adaptiveTemplateBank, appended by the generator). Read-only;
// newest decisions first so the deck opens on what Samy just approved.
import { NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";
import { mergeBank } from "@/lib/adaptive-prototype";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const approved = listDocs("users/local/triageQueue", {
    where: [["status", "==", "filed"]],
    orderBy: ["filedAt", "desc"],
  }).filter((d) => (d as { filedAs?: string }).filedAs !== "discard");

  const specs = listDocs("users/local/adaptivePrototype", {});
  const byItem = new Map(specs.map((s) => [(s as { itemId?: string }).itemId, s]));

  const bank = mergeBank(listDocs("users/local/adaptiveTemplateBank", {}));

  return NextResponse.json({
    items: approved.map((item) => ({
      item,
      spec: byItem.get((item as { id: string }).id) ?? null,
    })),
    templates: Object.fromEntries(bank),
  });
}
