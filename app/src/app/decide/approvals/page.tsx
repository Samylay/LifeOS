import { redirect } from "next/navigation";
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ id?: string; item?: string }> }) {
  const { id, item } = await searchParams;
  const selected = item ?? id;
  redirect(`/decide?tab=agents${selected ? `&item=${encodeURIComponent(selected)}` : ""}`);
}
