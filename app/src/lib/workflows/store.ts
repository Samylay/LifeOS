import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createDoc, getDoc, listDocs, runInTransaction, setDoc, updateDoc } from "@/lib/server-db";
import { createIdeaBankEntry } from "@/lib/content/idea-bank";
import { WORKFLOW_KINDS, EFFECTS, EFFECT_LABEL, effectConsequence, isWorkflowKind, safeSourceUrl, type WorkflowRun, type WorkflowReport, type WorkflowArtifact, type WorkflowState, type WorkflowKind, type PreparedEffect, type PreparedMaterial } from "./model";
import { workflowInstruction } from "./instructions";

export const RUNS = "users/local/workflowRuns";
export const LIBRARY = "users/local/workflowLibrary";
const SOURCES = "users/local/triageQueue";
const DISPATCH = "users/local/promptDispatch";
const uuidPattern = /^[a-f0-9-]{36}$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
export class WorkflowError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const now = () => new Date().toISOString();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function str(value: unknown, label: string, max = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new WorkflowError(`${label} must contain 1–${max} characters`);
  return value.trim();
}
function strings(value: unknown, label: string, min = 0, max = 30): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new WorkflowError(`${label} must contain ${min}–${max} entries`);
  return value.map((v) => str(v, label));
}
function rawRun(id: string): WorkflowRun & { tokenHash?: string; callbackHash?: string } {
  if (!uuidPattern.test(id)) throw new WorkflowError("Invalid run id");
  const run = getDoc(RUNS, id);
  if (!run) throw new WorkflowError("Workflow not found", 404);
  return run as unknown as WorkflowRun & { tokenHash?: string; callbackHash?: string };
}
export function getRun(id: string): WorkflowRun {
  const { tokenHash: _secret, callbackHash: _callback, ...run } = rawRun(id); void _secret; void _callback;
  const currentIntent = record(getDoc(SOURCES, run.itemId)?.calibration).id ?? null;
  if (["queued", "running", "ready", "awaiting-extraction"].includes(run.state) && currentIntent !== (run.intentRef ?? null)) {
    return { ...run, state: "blocked", reason: "Your intended use changed. This result belongs to the previous answer." };
  }
  if (["queued", "running", "applying"].includes(run.state) && run.dispatchId) {
    const job = getDoc(DISPATCH, run.dispatchId);
    if (job && ["done", "failed", "error"].includes(String(job.status))) {
      return { ...run, state: "blocked", reason: run.phase === "apply" ? "The host session ended without an application report. Inspect its outcome before attempting another change." : "The host session ended without a workflow result. Its output is available through the existing dispatch logs; retry after resolving the cause." };
    }
  }
  return run;
}
export function listRuns(): WorkflowRun[] { return listDocs(RUNS, { orderBy: ["createdAt", "desc"] }).map((r) => getRun(r.id)); }
function transition(run: WorkflowRun, state: WorkflowState, detail: string, patch: Record<string, unknown> = {}) {
  const at = now();
  updateDoc(RUNS, run.id, { ...patch, state, updatedAt: at, history: [...run.history, { state, at, detail }] });
}
function evidenceFor(item: Record<string, unknown>) {
  if (typeof item.evidenceRef !== "string") return null;
  const evidence = getDoc("users/local/triageEvidence", item.evidenceRef);
  if (!evidence || !Array.isArray(evidence.segments) || evidence.segments.length === 0) return null;
  return evidence;
}
function dispatch(run: WorkflowRun) {
  const token = randomBytes(32).toString("hex");
  const dispatchId = createDoc(DISPATCH, {
    prompt: workflowInstruction(run, token), itemCount: 1, titles: [run.phase === "apply" ? "Apply reviewed workflow result" : "Prepare saved-content result"],
    status: "pending", createdAt: { __date: now() }, workflowRunId: run.id,
  });
  transition(run, run.phase === "apply" ? "applying" : "queued", run.phase === "apply" ? "User approved the prepared change" : "Scoped evaluation sent to the host agent", { dispatchId, tokenHash: hash(token), callbackHash: null, reason: null });
}
export function startWorkflow(itemId: string, kind: WorkflowKind = "auto"): WorkflowRun {
  if (!isWorkflowKind(kind)) throw new WorkflowError("Unknown workflow kind");
  return runInTransaction(() => {
    const item = getDoc(SOURCES, itemId);
    if (!item) throw new WorkflowError("Saved item not found", 404);
    if (item.status === "discarded") throw new WorkflowError("Restore this item before developing it", 409);
    const preference = record(item.calibration);
    if (kind === "auto" && isWorkflowKind(preference.workflowKind)) kind = preference.workflowKind;
    const evidence = evidenceFor(item);
    // Repeated clicks cannot launch another evaluation of the same source/version/use.
    const existing = listRuns().find((run) => run.itemId === itemId && run.kind === kind && run.evidenceRef === (evidence?.id ?? null) && run.state !== "dismissed" && (run.intentRef ?? null) === (preference.id ?? null));
    if (existing) return existing;
    const at = now(); const id = randomUUID(); const proposal = record(item.proposal);
    const run: WorkflowRun = { id, itemId, kind, intentRef: typeof preference.id === "string" ? preference.id : null, title: String(proposal.title || proposal.summary || item.url || "Saved item").slice(0, 300), sourceUrl: safeSourceUrl(item.url), state: "awaiting-extraction", phase: "evaluate", evidenceRef: evidence?.id ?? null, createdAt: at, updatedAt: at, artifacts: [], history: [{ state: "awaiting-extraction", at, detail: "Source accepted for a workflow" }] };
    setDoc(RUNS, id, { ...run });
    if (evidence) dispatch(run);
    return getRun(id);
  });
}
/** Called after the ingestion agent publishes evidence. Historical saves aren't launched en masse. */
export function advanceWaitingWorkflows(itemId: string) {
  runInTransaction(() => {
    const item = getDoc(SOURCES, itemId); if (!item || item.status === "discarded") return;
    const evidence = evidenceFor(item); if (!evidence) return;
    for (const run of listRuns().filter((r) => r.itemId === itemId && r.state === "awaiting-extraction")) {
      updateDoc(RUNS, run.id, { evidenceRef: evidence.id });
      dispatch({ ...run, evidenceRef: evidence.id });
    }
  });
}
export function authenticateReporter(id: string, token: string): WorkflowRun {
  const run = rawRun(id); const actual = hash(token);
  if (!run.tokenHash || !timingSafeEqual(Buffer.from(actual), Buffer.from(run.tokenHash))) throw new WorkflowError("Invalid reporting token", 401);
  return getRun(id);
}
function sourceStillMatches(run: WorkflowRun) {
  const item = getDoc(SOURCES, run.itemId);
  if (item && (record(item.calibration).id ?? null) !== (run.intentRef ?? null)) throw new WorkflowError("Your intended use changed. Prepare a result from the updated answer.", 409);
  if (!item || item.status === "discarded" || (item.evidenceRef ?? null) !== run.evidenceRef) throw new WorkflowError("The source evidence changed. Start a workflow for the current version.", 409);
}
function parseReport(input: unknown, run: WorkflowRun): WorkflowReport {
  const value = record(input);
  if (!isWorkflowKind(value.kind) || value.kind === "auto") throw new WorkflowError("A concrete workflow kind is required");
  if (!["pass", "fail", "inconclusive", "reference"].includes(String(value.outcome))) throw new WorkflowError("Invalid result outcome");
  const effectInput = record(value.effect);
  if (!EFFECTS.includes(effectInput.kind as PreparedEffect["kind"])) throw new WorkflowError("Unsupported prepared effect");
  const effect: PreparedEffect = { kind: effectInput.kind as PreparedEffect["kind"], label: str(effectInput.label, "Action label", 80), consequence: str(effectInput.consequence, "Action consequence", 3000), target: str(effectInput.target, "Target", 64) };
  if (!slugPattern.test(effect.target)) throw new WorkflowError("Target must be a plain slug");
  if (["install-skill", "merge-skill", "integrate-tool"].includes(effect.kind)) {
    if (value.outcome !== "pass") throw new WorkflowError("Installation requires a passing evaluation");
    const repo = str(effectInput.repository, "Repository", 500);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new WorkflowError("Use an exact HTTPS GitHub repository URL");
    const commit = str(effectInput.commit, "Commit", 40);
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new WorkflowError("A full pinned commit is required");
    const sourcePath = str(effectInput.sourcePath, "Source path", 300);
    if (sourcePath.startsWith("/") || sourcePath.split("/").some((s) => !s || s === "." || s === "..") || !/^[a-zA-Z0-9_./-]+$/.test(sourcePath)) throw new WorkflowError("Unsafe source path");
    Object.assign(effect, { repository: repo, commit, sourcePath });
  }
  effect.label = EFFECT_LABEL[effect.kind];
  effect.consequence = effectConsequence(effect);
  const artifactIds = strings(value.artifactIds, "Artifact IDs", 0, 20);
  if (new Set(artifactIds).size !== artifactIds.length || artifactIds.some((id) => !run.artifacts.some((a) => a.id === id))) throw new WorkflowError("Artifacts must belong to this run");
  if (["design", "skill", "tool"].includes(value.kind) && !artifactIds.length) throw new WorkflowError("An experiment needs an inspectable artifact");
  if (value.kind === "skill" && artifactIds.length < 2) throw new WorkflowError("A skill comparison needs both task outputs");
  const metrics = value.metrics;
  if (!Array.isArray(metrics) || metrics.length > 20) throw new WorkflowError("Invalid metrics");
  let prepared: PreparedMaterial | undefined;
  if (value.prepared !== undefined) {
    const p = record(value.prepared);
    prepared = { title: str(p.title, "Prepared title", 200), body: str(p.body, "Prepared material", 30000) };
    if (p.recipe !== undefined) {
      const recipe = record(p.recipe);
      if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length || recipe.ingredients.length > 100) throw new WorkflowError("Recipe ingredients required");
      prepared.recipe = { name: str(recipe.name, "Recipe name", 200), ingredients: recipe.ingredients.map((ingredient) => { const i = record(ingredient); return { name: str(i.name, "Ingredient", 300), ...(i.quantity ? { quantity: str(i.quantity, "Quantity", 100) } : {}) }; }), steps: strings(recipe.steps, "Recipe steps", 1, 100) };
      for (const key of ["servings", "prepMinutes"] as const) if (recipe[key] !== undefined) {
        if (typeof recipe[key] !== "number" || !Number.isFinite(recipe[key]) || recipe[key] <= 0 || recipe[key] > 10000) throw new WorkflowError(`Invalid ${key}`);
        prepared.recipe[key] = recipe[key];
      }
    }
  }
  if (["save-recipe", "save-content", "save-lesson", "propose-training"].includes(effect.kind) && !prepared) throw new WorkflowError("Prepared material must be included for review");
  if (effect.kind === "save-recipe" && !prepared?.recipe) throw new WorkflowError("Structured recipe required");
  return { kind: value.kind, outcome: value.outcome as WorkflowReport["outcome"], summary: str(value.summary, "Summary", 5000), findings: strings(value.findings, "Findings", 1), limitations: strings(value.limitations, "Limitations"), artifactIds, effect, ...(prepared ? { prepared } : {}), metrics: metrics.map((entry) => {
    const m = record(entry);
    if (typeof m.treatment !== "number" || !Number.isFinite(m.treatment) || (m.control !== undefined && (typeof m.control !== "number" || !Number.isFinite(m.control)))) throw new WorkflowError("Metrics must be finite numbers");
    return { label: str(m.label, "Metric label", 100), treatment: m.treatment, ...(m.control !== undefined ? { control: m.control as number } : {}), unit: str(m.unit, "Metric unit", 50) };
  }) };
}
function notify(run: WorkflowRun, title: string, body: string) {
  createDoc("users/local/notifications", { stream: "capture", severity: "info", title, body, path: `/workflows?run=${run.id}`, createdAt: { __date: now() } });
}
export function receiveReport(id: string, token: string, body: Record<string, unknown>) {
  return runInTransaction(() => {
    const run = authenticateReporter(id, token);
    const fingerprint = hash(JSON.stringify(body));
    if (rawRun(id).callbackHash === fingerprint) return getRun(id);
    const event = body.event;
    if (event === "started") {
      if (run.state === "running" || run.state === "applying") return run;
      if (run.state !== "queued") throw new WorkflowError("This run cannot start", 409);
      transition(run, "running", "Agent began evaluating the source");
    } else if (event === "blocked") {
      if (!["queued", "running", "applying"].includes(run.state)) throw new WorkflowError("This run no longer accepts worker updates", 409);
      const reason = str(body.reason, "Blocker", 5000);
      transition(run, "blocked", reason, { reason, callbackHash: fingerprint });
      notify(run, "Workflow needs attention", `${run.title}: ${reason}`);
    } else if (event === "result") {
      if (!["queued", "running"].includes(run.state) || run.phase !== "evaluate") throw new WorkflowError("Result already recorded or not expected", 409);
      sourceStillMatches(run);
      const report = parseReport(body.report, run);
      transition(run, "ready", "Result recorded; awaiting the user's decision", { report, reportHash: hash(JSON.stringify(report)), callbackHash: fingerprint });
      notify(run, "Result ready to review", `${run.title}: ${report.summary}`);
    } else if (event === "applied") {
      if (run.state !== "applying" || run.phase !== "apply") throw new WorkflowError("No approved application is in progress", 409);
      const appliedSummary = str(body.summary, "Application result", 5000);
      const outcomeEvidence = strings(body.evidence, "Application evidence", 1);
      transition(run, "applied", appliedSummary, { appliedSummary, outcomeEvidence, destination: "/projects", callbackHash: fingerprint });
      notify(run, "Approved change applied", `${run.title}: ${appliedSummary}`);
    } else throw new WorkflowError("Unknown reporting event");
    return getRun(id);
  });
}
export function attachArtifact(id: string, token: string, artifact: WorkflowArtifact) {
  runInTransaction(() => {
    const run = authenticateReporter(id, token);
    if (!["queued", "running"].includes(run.state) || run.phase !== "evaluate") throw new WorkflowError("Artifacts are immutable after results", 409);
    if (run.artifacts.length >= 20) throw new WorkflowError("Artifact limit reached");
    updateDoc(RUNS, id, { artifacts: [...run.artifacts, artifact] });
  });
}
export function decideWorkflow(id: string, action: unknown, expectedHash: unknown) {
  return runInTransaction(() => {
    const run = getRun(id);
    if (action === "retry") {
      if (run.state !== "blocked" || run.phase !== "evaluate") throw new WorkflowError("Only blocked evaluations can be retried", 409);
      sourceStillMatches(run); dispatch(run); return getRun(id);
    }
    if (action === "dismiss") {
      if (run.state === "dismissed") return run;
      if (!["ready", "awaiting-extraction", "blocked", "queued"].includes(run.state)) throw new WorkflowError("Work has already started; its outcome must be reconciled", 409);
      if (run.state === "queued" || (run.state === "blocked" && rawRun(id).state === "queued")) {
        const job = run.dispatchId ? getDoc(DISPATCH, run.dispatchId) : null;
        if (job?.status !== "pending") throw new WorkflowError("Agent has claimed this work", 409);
        updateDoc(DISPATCH, run.dispatchId!, { status: "cancelled" });
      }
      transition(run, "dismissed", "User dismissed this workflow", { tokenHash: null }); return getRun(id);
    }
    if (action !== "approve") throw new WorkflowError("Unknown decision");
    if (typeof expectedHash !== "string" || expectedHash !== run.reportHash) throw new WorkflowError("Review the current result before approving", 409);
    if (["applying", "applied", "kept"].includes(run.state)) return run;
    if (run.state !== "ready" || !run.report) throw new WorkflowError("No prepared result to approve", 409);
    sourceStillMatches(run);
    const { effect, prepared } = run.report;
    if (["install-skill", "merge-skill", "integrate-tool"].includes(effect.kind)) {
      updateDoc(RUNS, id, { phase: "apply" }); dispatch({ ...run, phase: "apply" }); return getRun(id);
    }
    const at = { __date: now() };
    let destination = "/knowledge";
    if (effect.kind === "save-recipe") {
      const recipe = prepared!.recipe!;
      setDoc("users/local/recipes", `workflow-${id}`, { ...recipe, source: run.sourceUrl, notes: prepared!.body, workflowRunId: id, createdAt: at }); destination = "/recipes";
    } else if (effect.kind === "save-content") {
      const contentId = createIdeaBankEntry({ title: prepared!.title, content: `${prepared!.body}\n\nSource: ${run.sourceUrl}` });
      updateDoc("users/local/contentIdeas", contentId, { workflowRunId: id }); destination = "/content";
    } else if (effect.kind === "save-lesson") destination = "/teaching";
    else if (effect.kind === "propose-training") destination = "/workouts";
    setDoc(LIBRARY, id, { title: prepared?.title || run.title, body: prepared?.body || run.report.summary, kind: run.report.kind, effect: effect.kind, sourceUrl: run.sourceUrl, runId: id, destination, createdAt: at });
    transition(run, effect.kind === "keep-reference" ? "kept" : "applied", effect.kind === "propose-training" ? "Training proposal saved for review; current program preserved" : "Prepared material saved", { destination, tokenHash: null });
    return getRun(id);
  });
}
export function cancelUnstartedForItem(itemId: string) {
  for (const run of listRuns().filter((r) => r.itemId === itemId && !["dismissed"].includes(r.state))) {
    if (!["awaiting-extraction", "queued"].includes(run.state)) throw new WorkflowError("A workflow has started. Review its state before restoring this source.", 409);
    decideWorkflow(run.id, "dismiss", undefined);
  }
}
export function sourceChoices() {
  return listDocs(SOURCES).filter((i) => i.status !== "discarded").map((i) => ({ id: i.id, title: String(record(i.proposal).title || record(i.proposal).summary || i.url || "Saved item").slice(0, 300), sourceUrl: safeSourceUrl(i.url), hasEvidence: !!evidenceFor(i), status: String(i.status), evidenceRef: typeof i.evidenceRef === "string" ? i.evidenceRef : null }));
}
export { WORKFLOW_KINDS };
