import {
  Home01Icon, Layers01Icon, CheckListIcon, Folder01Icon, Video01Icon,
  BookOpen01Icon, Mic01Icon, Dumbbell01Icon, Wallet01Icon, Search01Icon,
  Settings01Icon, Activity01Icon, News01Icon, Menu01Icon, ComputerTerminal01Icon,
  Restaurant01Icon, PlayListIcon,
} from "@hugeicons/core-free-icons";

// One route inventory for desktop, mobile, and the current-page label.
export const NAV_GROUPS = [
  { label: "Workspace", items: [
    { href: "/", label: "Today", icon: Home01Icon },
    { href: "/decide", label: "Decide", icon: Layers01Icon },
    { href: "/decide/approvals", label: "Approvals", icon: CheckListIcon },
    { href: "/projects", label: "Projects", icon: Folder01Icon },
    { href: "/content", label: "Content", icon: Video01Icon },
    { href: "/leads", label: "Leads", icon: Search01Icon },
  ]},
  { label: "Personal", items: [
    { href: "/voice", label: "Voice", icon: Mic01Icon },
    { href: "/knowledge", label: "Knowledge", icon: BookOpen01Icon },
    { href: "/workouts", label: "Training", icon: Dumbbell01Icon },
    { href: "/finance", label: "Finance", icon: Wallet01Icon },
  ]},
  { label: "Explore", items: [
    { href: "/news", label: "News", icon: News01Icon },
    { href: "/feed", label: "Feed", icon: PlayListIcon },
    { href: "/recipes", label: "Recipes", icon: Restaurant01Icon },
  ]},
];
export const NAV_UTILITIES = [
  { href: "/status", label: "Status", icon: Activity01Icon },
  { href: "/terminal", label: "Terminal", icon: ComputerTerminal01Icon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
];
export const NAV_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_UTILITIES];
export const MOBILE_ITEMS = ["/", "/decide", "/voice", "/projects"].map((href) => NAV_ITEMS.find((i) => i.href === href)!);
export { Menu01Icon };

export function activeDestination(pathname: string) {
  return NAV_ITEMS.filter((item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
export function surfaceTitle(pathname: string) {
  if (pathname === "/decide/dispatch") return "Send to Claude";
  if (pathname.startsWith("/prime")) return "Priming";
  if (pathname === "/diagrams") return "Diagrams";
  return activeDestination(pathname)?.label ?? "Today";
}
