import {
  Home01Icon, Layers01Icon, CheckListIcon,
  Mic01Icon, Dumbbell01Icon, Wallet01Icon, Search01Icon,
  Settings01Icon, Activity01Icon, News01Icon, Menu01Icon, ComputerTerminal01Icon,
  Chat01Icon,
} from "@hugeicons/core-free-icons";

// One route inventory for desktop, mobile, and the current-page label.
export const NAV_GROUPS = [
  { label: "Workspace", items: [
    { href: "/", label: "Today", icon: Home01Icon },
    { href: "/news", label: "News", icon: News01Icon },
    { href: "/decide", label: "Decide", icon: Layers01Icon },
    { href: "/decide/approvals", label: "Approvals", icon: CheckListIcon },
    { href: "/micro", label: "Micro", icon: ComputerTerminal01Icon },
    { href: "/workflows", label: "Workflows", icon: Layers01Icon },
    { href: "/chat", label: "Chat", icon: Chat01Icon },
  ]},
  { label: "Personal", items: [
    { href: "/voice", label: "Fluency", icon: Mic01Icon },
    { href: "/workouts", label: "Training", icon: Dumbbell01Icon },
    { href: "/finance", label: "Finance", icon: Wallet01Icon },
  ]},
  { label: "Explore", items: [
    { href: "/leads", label: "Leads", icon: Search01Icon },
  ]},
];
export const NAV_UTILITIES = [
  { href: "/status", label: "Status", icon: Activity01Icon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
];
export const NAV_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_UTILITIES];
export const MOBILE_ITEMS = ["/", "/decide", "/chat", "/voice"].map((href) => NAV_ITEMS.find((i) => i.href === href)!);
export { Menu01Icon };

export function activeDestination(pathname: string) {
  return NAV_ITEMS.filter((item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
export function surfaceTitle(pathname: string) {
  if (pathname === "/knowledge/teach") return "Teach";
  if (pathname.startsWith("/knowledge/teach/")) return "Teach session";
  if (pathname === "/crawl4ai") return "Source preview";
  if (pathname === "/review") return "Overhaul review";
  if (pathname === "/voice/capture") return "Quick capture";
  if (pathname === "/decide/dispatch") return "Results";
  return activeDestination(pathname)?.label ?? "Today";
}
