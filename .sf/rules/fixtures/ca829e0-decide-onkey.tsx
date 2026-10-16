// Excerpt of app/src/app/decide/page.tsx at ca829e0 (finding CU-03, before the fix).
export function install(filtered: any[], selected: any, setSelectedId: any, decideSaved: any, decideAgent: any, decideWorkflow: any) {
    const onKey = (event: KeyboardEvent) => {
      if (document.documentElement.clientWidth < 1024 || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const index = filtered.findIndex((entry) => entry.id === selected?.id);
        const next = Math.min(filtered.length - 1, Math.max(0, index + (event.key === "j" ? 1 : -1)));
        if (filtered[next]) setSelectedId(filtered[next].id);
      } else if (event.key === "Enter" && selected) {
        document.querySelector<HTMLElement>("[aria-live='polite']")?.focus();
      } else if (selected?.group === "saved" && selected.kind === "triage") {
        if (event.key === "a") void decideSaved(selected, "approve");
        if (event.key === "d") void decideSaved(selected, "defer");
        if (event.key === "x") void decideSaved(selected, "discard");
      } else if (selected?.kind === "agent") {
        if (event.key === "a") void decideAgent(selected.item, "approved");
        if (event.key === "d") void decideAgent(selected.item, "deferred");
        if (event.key === "x") void decideAgent(selected.item, "rejected");
      } else if (selected?.kind === "workflow" && selected.item.state === "ready" && event.key === "a") {
        void decideWorkflow(selected.item, "approve");
      }
    };
}
