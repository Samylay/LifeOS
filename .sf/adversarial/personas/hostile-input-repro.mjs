import { startPersona } from "../lib.mjs";
const p = await startPersona("hostile-input");
for (const r of ["/", "/settings/habits"]) { await p.go(r); await p.page.waitForTimeout(1200); await p.shot("habit-history-object" + r.replace(/\//g, "_")); }
console.log("pageErrors", JSON.stringify(p.journal.pageErrors.map(e => e.message)));
console.log(await p.finish());
