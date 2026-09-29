import { redirect } from "next/navigation";
export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ id?: string; item?: string; run?: string }> }) {
  const { id, item, run } = await searchParams;
  const selected = item ?? run ?? id;
  redirect(`/decide?tab=results${selected ? `&item=${encodeURIComponent(selected)}` : ""}`);
}
