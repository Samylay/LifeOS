import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-feed-abtest-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpRoot, "feed.db");
process.env.ABTEST_CONTENT_DIR = path.join(tmpRoot, "corpus");

const { setDoc, getDoc } = await import("./server-db");
const { CARDS, getCard, listCards, materializeCard, markShown } = await import("./feed");

let caseNumber = 0;
let caseSlug = "imported-case";

beforeEach(() => {
  caseSlug = `imported-case-${++caseNumber}`;
  fs.rmSync(process.env.ABTEST_CONTENT_DIR!, { recursive: true, force: true });
  fs.mkdirSync(process.env.ABTEST_CONTENT_DIR!, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.ABTEST_CONTENT_DIR!, "manifest.json"),
    JSON.stringify({
      version: 1,
      tests: [
        {
          slug: caseSlug,
          title: "Imported case",
          company: "Acme",
          category: "pricing",
          summary: "Summary",
          results: ["Result"],
          sourceUrl: "https://abtest.design/tests/imported-case",
          images: [],
        },
      ],
    })
  );
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe("imported feed cards", () => {
  it("joins reads without writing, then materializes before shown interaction", () => {
    const id = `abtest:${caseSlug}`;
    expect(getDoc(CARDS, id)).toBeNull();
    expect(getCard(id)?.id).toBe(id);
    expect(getDoc(CARDS, id)).toBeNull();

    markShown(id);
    expect(getDoc(CARDS, id)).not.toBeNull();
    expect(getCard(id)?.timesShown).toBe(1);
  });

  it("lets a stored card with the stable id win over its imported version", () => {
    const id = `abtest:${caseSlug}`;
    setDoc(CARDS, id, {
      topicId: "abtest-design",
      origin: "queue",
      subConcept: "pricing",
      format: "wild_example",
      hook: "Stored state",
      body: "Stored body",
      status: "kept",
      timesShown: 4,
      intervalIndex: 2,
      postable: true,
      contentHash: "stored-hash",
    });
    expect(listCards().find((card) => card.id === id)).toMatchObject({
      hook: "Stored state",
      status: "kept",
      timesShown: 4,
    });
  });

  it("materializes a card with its full imported presentation metadata", () => {
    const id = `abtest:${caseSlug}`;
    const card = materializeCard(id);
    expect(card).toMatchObject({
      id,
      company: "Acme",
      category: "pricing",
      results: ["Result"],
    });
    expect(getDoc(CARDS, id)).toMatchObject({ company: "Acme", results: ["Result"] });
  });
});
