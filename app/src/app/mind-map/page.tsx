import { Network } from "lucide-react";
import { MindMapWorkspace } from "@/components/mind-map/mind-map-workspace";
import { Page, PageHeader } from "@/components/ui/page";

export default function MindMapPage() {
  return (
    <Page className="max-w-7xl">
      <PageHeader
        kicker="Workspace"
        title="Mind map"
        description="Explore your notes and their connections, or move between LifeOS areas."
        icon={Network}
      />
      <MindMapWorkspace />
    </Page>
  );
}
