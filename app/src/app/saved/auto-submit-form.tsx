"use client";

import { useRef, type ReactNode } from "react";

/** A GET search form that submits as you type (350 ms after the last keystroke) and when a
 *  select changes. Without JavaScript the hidden submit button and Enter still work. */
export function AutoSubmitForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitSoon = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => form.current?.requestSubmit(), delay);
  };
  return (
    <form ref={form} action={action} role="search" className={className}
      onInput={(event) => { if ((event.target as HTMLElement).tagName === "INPUT") submitSoon(350); }}
      onChange={(event) => { if ((event.target as HTMLElement).tagName === "SELECT") submitSoon(0); }}>
      {children}
      <button type="submit" className="sr-only">Search</button>
    </form>
  );
}
