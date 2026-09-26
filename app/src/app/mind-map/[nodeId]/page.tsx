import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Page, PageHeader } from "@/components/ui/page";
import {
  MIND_MAP_BY_ID,
  MIND_MAP_OUTGOING,
} from "@/lib/mind-map-data";

export default async function MindMapNodePage({ params }: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await params;
  const node = MIND_MAP_BY_ID.get(nodeId);
  if (!node) notFound();

  const connected = MIND_MAP_OUTGOING(node.id)
    .map((edge) => MIND_MAP_BY_ID.get(edge.source === node.id ? edge.target : edge.source))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <Page className="max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="w-fit active:scale-[0.97]">
        <Link href="/mind-map"><ArrowLeft size={14} />Back to mind map</Link>
      </Button>
      <PageHeader
        title={node.label}
      />
      <Card className="gap-2 p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">About this node</p>
        <p className="text-sm leading-relaxed">{node.summary}</p>
        <p className="text-xs text-muted-foreground">This is a generic example. Vault notes can feed this view in a later step.</p>
      </Card>
      {connected.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Connected nodes</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {connected.map((item) => (
              <Button key={item.id} asChild variant="outline" className="h-auto min-h-12 justify-between whitespace-normal px-3 py-2 text-left active:scale-[0.99]">
                <Link href={`/mind-map/${item.id}`}>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{item.summary}</span>
                  </span>
                  <ArrowUpRight size={14} className="shrink-0" />
                </Link>
              </Button>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
