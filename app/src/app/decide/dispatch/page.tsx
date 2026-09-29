import { redirect } from "next/navigation";
export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ id?: string; item?: string }> }) {
  const { id, item } = await searchParams;
  const selected = item ?? id;
  redirect(`/decide?tab=results${selected ? `&item=${encodeURIComponent(selected)}` : ""}`);
}
