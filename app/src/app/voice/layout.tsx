import type { Metadata } from "next";

export const metadata: Metadata = { title: "Voice — LifeOS" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
