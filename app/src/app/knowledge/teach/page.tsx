import { GraduationCap } from "lucide-react";
import { TeachSection } from "@/components/teach/teach-section";
import { Page, PageHeader } from "@/components/ui/page";

export default function TeachPage() {
  return (
    <Page>
      <PageHeader title="Teach" icon={GraduationCap} />
      <TeachSection />
    </Page>
  );
}
