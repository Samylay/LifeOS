import { redirect } from "next/navigation";

// Goals merged into the unified Projects surface (2026-07-14): goals set the
// direction, projects ship it, the ship log keeps score — one page.
export default function GoalsPage() {
  redirect("/projects");
}
