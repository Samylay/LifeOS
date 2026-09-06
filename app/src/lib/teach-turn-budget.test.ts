import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Ticket 02 ("A teach session Samy can finish") gets its own test file rather
// than living inside teach.test.ts: this file's session-flow tests (start →
// several learner turns → auto-end) create enough sqlite docs that, combined
// with teach.test.ts's own volume in the same worker process, tripped a
// native better-sqlite3/Node crash unrelated to either suite's logic
// (`RemoveEnvironmentCleanupHook` assertion during Statement teardown — a
// resource-ceiling issue, not a correctness one). Vitest gives each test file
// its own worker by default, so a separate file with its own db keeps this
// suite's volume from compounding with teach.test.ts's.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-teach-budget-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");
// endSession (called once the budget is spent) writes the routed transcript
// into KB_PATH (default "/vault") — point it at a scratch dir.
const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-teach-budget-vault-"));
process.env.KB_PATH = vaultDir;

// The tutor's model call shells out to the Claude CLI for real — stub it so
// startSession/learnerTurn/endSession can run against fixtures instead.
vi.mock("./claude-cli", () => ({
  generateJson: vi.fn(async (prompt: string) => {
    if (prompt.includes("Summarize this voice teaching session")) {
      return { summary: "a test summary", learningRecord: "a test learning record" };
    }
    return { reply: "tutor reply text", followUps: ["follow up 1", "follow up 2"] };
  }),
}));

const { addTopic, getSession, startSession, learnerTurn, endSession, sessionProgress } = await import(
  "./teach"
);
const { createDoc } = await import("./server-db");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

describe("sessionProgress — pure, over fixtures (ticket 02)", () => {
  it("an unbounded session (no turnBudget) never reports spent, at any turn count", () => {
    const session = { turnBudget: undefined };
    expect(sessionProgress(session, [])).toEqual({
      turnBudget: undefined,
      turnsUsed: 0,
      turnsRemaining: undefined,
      budgetSpent: false,
    });
    const manyTurns: { role: "tutor" | "learner" }[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "tutor" : "learner",
    }));
    expect(sessionProgress(session, manyTurns).budgetSpent).toBe(false);
  });

  it("counts only learner turns against the budget — tutor turns are free", () => {
    const session = { turnBudget: 3 };
    const turns = [
      { role: "tutor" as const }, // opening turn, doesn't count
      { role: "learner" as const },
      { role: "tutor" as const },
    ];
    const progress = sessionProgress(session, turns);
    expect(progress).toEqual({ turnBudget: 3, turnsUsed: 1, turnsRemaining: 2, budgetSpent: false });
  });

  it("reports spent exactly when turnsUsed reaches the budget, never before", () => {
    const session = { turnBudget: 2 };
    const oneUsed = [{ role: "learner" as const }, { role: "tutor" as const }];
    expect(sessionProgress(session, oneUsed).budgetSpent).toBe(false);

    const twoUsed = [
      { role: "learner" as const },
      { role: "tutor" as const },
      { role: "learner" as const },
      { role: "tutor" as const },
    ];
    const progress = sessionProgress(session, twoUsed);
    expect(progress.budgetSpent).toBe(true);
    expect(progress.turnsRemaining).toBe(0);
  });

  it("turnsRemaining never goes negative even if somehow over budget", () => {
    const session = { turnBudget: 1 };
    const overBudget = [
      { role: "learner" as const },
      { role: "learner" as const },
      { role: "learner" as const },
    ];
    const progress = sessionProgress(session, overBudget);
    expect(progress.turnsRemaining).toBe(0);
    expect(progress.budgetSpent).toBe(true);
  });
});

describe("startSession / learnerTurn / endSession — bounded sessions (ticket 02)", () => {
  it("a session declares its length up front: turnBudget is visible immediately, before any turn", async () => {
    const topicId = addTopic("bounded topic A", "because");
    const { sessionId, opening } = startSession(topicId, undefined, 8);
    await opening;
    const found = getSession(sessionId);
    expect(found?.session.turnBudget).toBe(8);
    expect(sessionProgress(found!.session, found!.turns).turnsUsed).toBe(0);
  });

  it("progress is visible and correct after each learner turn, before the budget is spent", async () => {
    const topicId = addTopic("bounded topic B", "because");
    const { sessionId, opening } = startSession(topicId, undefined, 3);
    await opening;

    const first = await learnerTurn(sessionId, "my first answer");
    expect(first.ended).toBe(false);
    expect(first.progress).toEqual({ turnBudget: 3, turnsUsed: 1, turnsRemaining: 2, budgetSpent: false });

    const second = await learnerTurn(sessionId, "my second answer");
    expect(second.ended).toBe(false);
    expect(second.progress.turnsUsed).toBe(2);
    expect(second.progress.turnsRemaining).toBe(1);

    const found = getSession(sessionId);
    expect(found?.session.status).toBe("live");
  });

  it("the session ends itself once the budget is spent, and routes as finished — never abandoned", async () => {
    const topicId = addTopic("bounded topic C", "because");
    const { sessionId, opening } = startSession(topicId, undefined, 2);
    await opening;

    await learnerTurn(sessionId, "answer one");
    const last = await learnerTurn(sessionId, "answer two");

    expect(last.ended).toBe(true);
    expect(last.progress.budgetSpent).toBe(true);

    const found = getSession(sessionId);
    expect(found?.session.status).toBe("routed");
    expect(found?.session.abandoned).toBeFalsy();
    expect(found?.session.vaultPath).toBeTruthy();

    // a spent session is no longer live — a further turn is refused, exactly
    // like ending it manually would refuse one.
    await expect(learnerTurn(sessionId, "one turn too many")).rejects.toThrow(/not live/i);
  });

  it("reopening an interrupted session resumes at the turn he left, with the remaining budget correct", async () => {
    const topicId = addTopic("bounded topic D", "because");
    const { sessionId, opening } = startSession(topicId, undefined, 5);
    await opening;
    await learnerTurn(sessionId, "answer one");
    await learnerTurn(sessionId, "answer two");

    // Simulate reopening: a fresh read of the session, exactly what the GET
    // route does — progress is re-derived from the persisted turns, not from
    // any counter carried across the interruption.
    const reopened = getSession(sessionId);
    expect(reopened?.session.status).toBe("live");
    expect(reopened?.turns.length).toBe(5); // opening tutor + 2 full exchanges
    const progress = sessionProgress(reopened!.session, reopened!.turns);
    expect(progress).toEqual({ turnBudget: 5, turnsUsed: 2, turnsRemaining: 3, budgetSpent: false });

    // and it keeps working from here to completion.
    await learnerTurn(sessionId, "answer three");
    const fourth = await learnerTurn(sessionId, "answer four");
    const fifth = await learnerTurn(sessionId, "answer five");
    expect(fourth.ended).toBe(false);
    expect(fifth.ended).toBe(true);
  });

  it("a session recorded before this change (no turnBudget) still opens, turns and ends without error", async () => {
    const topicId = addTopic("legacy topic", "because");
    // A pre-ticket-02 session, written the way startSession used to: no
    // turnBudget field at all, not even undefined.
    const sessionId = createDoc("users/local/teachSessions", {
      topicId,
      topic: "legacy topic",
      status: "live",
      lastActivityAt: new Date(),
      startedAt: new Date(),
    });

    const found = getSession(sessionId);
    expect(sessionProgress(found!.session, found!.turns)).toEqual({
      turnBudget: undefined,
      turnsUsed: 0,
      turnsRemaining: undefined,
      budgetSpent: false,
    });

    const reply = await learnerTurn(sessionId, "an answer with no budget");
    expect(reply.ended).toBe(false);
    expect(reply.progress.budgetSpent).toBe(false);

    const vaultPath = await endSession(sessionId, false);
    expect(vaultPath).toBeTruthy();
    expect(getSession(sessionId)?.session.status).toBe("routed");
  });

  it("startSession without an explicit turnBudget stays open-ended, as before", async () => {
    const topicId = addTopic("unbounded topic", "because");
    const { sessionId, opening } = startSession(topicId);
    await opening; // drain the opening tutor turn before the test (and file) ends
    const found = getSession(sessionId);
    expect(found?.session.turnBudget).toBeUndefined();
  });
});
