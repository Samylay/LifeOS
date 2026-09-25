import { Network } from "lucide-react";
import { MindMapView } from "@/components/mind-map/mind-map-view";
import { Page, PageHeader } from "@/components/ui/page";

export default function MindMapPage() {
  return (
    <Page className="max-w-7xl">
      <PageHeader
        kicker="Workspace"
        title="Mind map"
        description="See how your current projects and learning threads connect."
        icon={Network}
      />
      <MindMapView />
    </Page>
  );
}
