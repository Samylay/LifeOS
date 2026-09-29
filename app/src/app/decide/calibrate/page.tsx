import { redirect } from "next/navigation";
export default async function CalibratePage({ searchParams }: { searchParams: Promise<{ id?: string; item?: string; itemId?: string }> }) {
  const { id, item, itemId } = await searchParams;
  const selected = item ?? itemId ?? id;
  redirect(`/decide?tab=saved${selected ? `&item=${encodeURIComponent(selected)}` : ""}`);
}
