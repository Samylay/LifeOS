import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mind map — LifeOS" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
