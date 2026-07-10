import { redirect } from "next/navigation";

// The Morning Brief merged into the Today home page (2026-07-10 IA restructure).
export default function BriefRedirect() {
  redirect("/");
}
