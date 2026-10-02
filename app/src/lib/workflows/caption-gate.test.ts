import { afterAll, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-caption-gate-"));
process.env.LIFEOS_DB_PATH = path.join(tmp, "test.db");
const { setDoc, listDocs } = await import("../server-db");
const { startWorkflow, advanceWaitingWorkflows, getRun } = await import("./store");
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

it("keeps approved workflows waiting while only saved metadata is available", () => {
  setDoc("users/local/triageQueue", "saved", { url: "https://example.org/source", status: "filed", evidenceRef: "caption" });
  setDoc("users/local/triageEvidence", "caption", { bundleId: "caption", segments: [{ id: "s", text: "Captured words" }], coverage: [{ reasonCode: "saved_metadata_only" }] });
  const run = startWorkflow("saved", "reference");
  expect(run.state).toBe("awaiting-extraction");
  advanceWaitingWorkflows("saved");
  expect(getRun(run.id).state).toBe("awaiting-extraction");
  expect(listDocs("users/local/promptDispatch")).toHaveLength(0);
});
