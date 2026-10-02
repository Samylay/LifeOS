import {
  Home01Icon, CheckListIcon, Chat01Icon,
  Dumbbell01Icon, Wallet01Icon,
  Settings01Icon, Activity01Icon,
} from "@hugeicons/core-free-icons";

// One route inventory for desktop, mobile, and the current-page label.
export const NAV_ITEMS = [
  { href: "/", label: "Today", icon: Home01Icon },
  { href: "/decide", label: "Inbox", icon: CheckListIcon },
  { href: "/saved", label: "Saved", icon: CheckListIcon },
  { href: "/chat", label: "Assistant", icon: Chat01Icon },
  { href: "/workouts", label: "Training", icon: Dumbbell01Icon },
  { href: "/finance", label: "Money", icon: Wallet01Icon },
  { href: "/status", label: "System", icon: Activity01Icon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
];
export const MOBILE_ITEMS = NAV_ITEMS.filter((item) =>
  ["/", "/decide", "/chat", "/workouts", "/finance"].includes(item.href)
);

export function activeDestination(pathname: string) {
  if (pathname === "/workflows" || pathname.startsWith("/workflows/")) {
    return NAV_ITEMS.find((item) => item.href === "/decide");
  }
  if (pathname === "/pager" || pathname.startsWith("/pager/")) {
    return NAV_ITEMS.find((item) => item.href === "/status");
  }
  return NAV_ITEMS.filter((item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
export function surfaceTitle(pathname: string) {
  if (pathname === "/knowledge/teach") return "Teach";
  if (pathname.startsWith("/knowledge/teach/")) return "Teach session";
  return activeDestination(pathname)?.label ?? "Today";
}
