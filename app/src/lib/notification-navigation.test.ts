import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

async function click(standalone: boolean, path = "/chat?codexSession=abc") {
  const handlers: Record<string, (event: unknown) => void> = {};
  const browser = { url: "https://homelab.tail069527.ts.net/", navigate: vi.fn(), focus: vi.fn(), postMessage: (_data: unknown, ports: MessagePort[]) => ports[0].postMessage({ standalone: false }) };
  const app = { ...browser, navigate: vi.fn().mockResolvedValue(null), focus: vi.fn(), postMessage: (_data: unknown, ports: MessagePort[]) => ports[0].postMessage({ standalone: true }) };
  const openWindow = vi.fn();
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, registration: { scope: "https://homelab.tail069527.ts.net/" }, location: { origin: "https://homelab.tail069527.ts.net" }, clients: { matchAll: async () => standalone ? [browser, app] : [browser], openWindow } },
    MessageChannel, URL, setTimeout, clearTimeout,
  });
  let completion: Promise<unknown> | undefined;
  handlers.notificationclick({ notification: { close: vi.fn(), data: { url: path } }, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
  await completion;
  return { browser, app, openWindow };
}
it("opens the notification inside the installed app even when a browser tab comes first", async () => {
  const { browser, app, openWindow } = await click(true);
  expect(browser.navigate).not.toHaveBeenCalled();
  expect(app.navigate).toHaveBeenCalledWith("https://homelab.tail069527.ts.net/chat?codexSession=abc");
  expect(app.focus).toHaveBeenCalledOnce();
  expect(openWindow).not.toHaveBeenCalled();
});
it("lets the browser route to the installed app when its window is closed", async () => {
  const { browser, openWindow } = await click(false);
  expect(browser.navigate).not.toHaveBeenCalled();
  expect(openWindow).toHaveBeenCalledWith("https://homelab.tail069527.ts.net/chat?codexSession=abc");
});
it("rejects an external destination", async () => {
  const { app } = await click(true, "//outside.example/phish");
  expect(app.navigate).toHaveBeenCalledWith("https://homelab.tail069527.ts.net/pager");
});
