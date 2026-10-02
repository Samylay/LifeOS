import Link from "next/link";
import { Page, PageHeader } from "@/components/ui/page";
import { savedLibrary, SAVED_FIELDS } from "@/lib/saved-library";
import { AREAS } from "@/lib/types";
export const dynamic = "force-dynamic";
const press = "inline-flex min-h-11 items-center rounded-md px-3 text-sm text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] hover:underline";
const control = "min-h-11 rounded-lg border border-border bg-background px-3 text-sm";
export default async function SavedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const field = typeof params.field === "string" ? params.field : "";
  const area = typeof params.area === "string" ? params.area : "";
  const result = savedLibrary({ q, field, area, page: Number(params.page ?? 1) });
  const pageUrl = (page: number) => `/saved?${new URLSearchParams({ q, field, area, page: String(page) })}`;
  return <Page className="max-w-6xl">
    <PageHeader title="Saved" actions={<Link href="/decide" className={press}>Inbox</Link>} />
    <form action="/saved" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]" role="search">
      <label className="grid gap-1 text-xs text-muted-foreground">Search captured information<input name="q" defaultValue={q} maxLength={300} className={control} placeholder="Words, ideas, or a source URL" /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">Polymath field<select name="field" defaultValue={field} className={control}><option value="">All fields</option>{SAVED_FIELDS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs text-muted-foreground">Life area<select name="area" defaultValue={area} className={control}><option value="">All areas</option>{Object.entries(AREAS).map(([id,v]) => <option key={id} value={id}>{v.name}</option>)}</select></label>
      <button className={`${press} self-end border border-border`} type="submit">Search</button>
    </form>
    <p className="text-sm text-muted-foreground">{result.total} matching saves of {result.allSaves}. Source gaps remain visible. Classifications appear as processing finishes.</p>
    <ul className="divide-y divide-border">
      {result.items.map(item => <li key={item.id} className="py-5">
        <Link href={`/decide/sources/${encodeURIComponent(item.id)}`} className={`${press} h-auto px-0 font-medium [overflow-wrap:anywhere]`}>{item.title}</Link>
        {item.snippet || item.summary ? <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{item.snippet || item.summary}</p> : null}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{item.savedAt.slice(0,10) || "Date unknown"}</span><span>{item.segmentCount} captured segments</span><span>{item.quality === "not-extracted" ? "Awaiting extraction" : item.quality === "unavailable" ? "Source unavailable" : item.quality === "limited" ? "Partial capture" : "Captured"}</span>{!item.classified && <span>Awaiting classification</span>}</div>
        <div className="mt-2 flex flex-wrap gap-2">{item.fieldIds.map(id => <Link key={id} href={`/saved?field=${encodeURIComponent(id)}`} className={`${press} bg-secondary text-xs`}>{SAVED_FIELDS.find(v => v.id === id)?.name ?? id}</Link>)}{item.areaIds.map(id => <Link key={id} href={`/saved?area=${encodeURIComponent(id)}`} className={`${press} bg-secondary text-xs`}>{AREAS[id as keyof typeof AREAS]?.name ?? id}</Link>)}</div>
      </li>)}
    </ul>
    {!result.items.length && <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">No saves match these filters. <Link href="/saved" className={press}>Show all saves</Link></p>}
    <nav aria-label="Saved pages" className="flex items-center justify-between">{result.page > 1 ? <Link href={pageUrl(result.page-1)} className={press}>Previous</Link> : <span />}<span className="text-sm text-muted-foreground">Page {result.page} of {result.pages}</span>{result.page < result.pages ? <Link href={pageUrl(result.page+1)} className={press}>Next</Link> : <span />}</nav>
  </Page>;
}
