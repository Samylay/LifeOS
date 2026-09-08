import { createHash } from "node:crypto";
import { listDocs, setDoc, deleteDoc } from "./server-db";
import { SPENDING_CATEGORIES, type MerchantLabel } from "./finance-activity";

const COLLECTION = "users/local/financeMerchantLabels";
const idFor = (key: string) => createHash("sha256").update(key).digest("hex");

export function listMerchantLabels(): Record<string, MerchantLabel> {
  return Object.fromEntries(listDocs(COLLECTION).map((doc) => [String(doc.merchantKey), { label: String(doc.label), category: doc.category as MerchantLabel["category"] }]));
}

export function saveMerchantLabel(merchantKey: string, label: string, category: string) {
  if (!merchantKey.trim() || merchantKey.length > 500 || !label.trim() || label.length > 100 || !SPENDING_CATEGORIES.includes(category as MerchantLabel["category"])) {
    throw new Error("Choose a name (up to 100 characters) and a valid category.");
  }
  setDoc(COLLECTION, idFor(merchantKey), { merchantKey, label: label.trim(), category });
}
export function clearMerchantLabel(merchantKey: string) { deleteDoc(COLLECTION, idFor(merchantKey)); }
