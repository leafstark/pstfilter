import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProcessingEngine } from "../../src/core/processing-engine.js";
import { SimpleKeywordMatcher } from "../../src/matching/keyword-matcher.js";
import { compileKeywords } from "../../src/matching/keyword-parser.js";
import { OutputManager } from "../../src/output/output-manager.js";
import { ProgressReporter } from "../../src/progress/progress-reporter.js";
import type { PstReader } from "../../src/pst/pst-reader.js";
import type { MatchOptions, ProcessingOptions, RawEmail } from "../../src/core/types.js";

/** In-memory reader that also asserts it is iterated only once. */
class FakePstReader implements PstReader {
  iterations = 0;
  constructor(private readonly emails: RawEmail[]) {}
  async open(): Promise<void> {}
  async *messages(): AsyncIterable<RawEmail> {
    this.iterations += 1;
    for (const e of this.emails) {
      yield e;
    }
  }
  async close(): Promise<void> {}
}

function raw(subject: string, body: string, id: string): RawEmail {
  return {
    source: { pstPath: "/tmp/archive.pst", folderPath: "Inbox", internalId: id },
    date: new Date("2026-06-01T12:00:00Z"),
    from: { name: "John", address: "john@example.com" },
    to: ["team@example.com"],
    cc: [],
    bcc: [],
    subject,
    bodyText: body,
    bodyHtml: null,
    attachments: [],
  };
}

const match: MatchOptions = {
  caseSensitive: false,
  regex: false,
  subject: true,
  body: true,
};

let outDir: string;
let inputPath: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "pstfilter-engine-"));
  // Use this test file itself as an existing input path (engine only checks existence).
  inputPath = new URL(import.meta.url).pathname;
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("ProcessingEngine end-to-end", () => {
  it("routes each email independently to every matching keyword, one scan", async () => {
    const emails = [
      raw("Graylog incident follow-up", "", "m1"),
      raw("Kubernetes rollout", "cluster notes", "m2"),
      raw("Weekly newsletter", "nothing relevant", "m3"),
    ];
    const reader = new FakePstReader(emails);
    const keywords = compileKeywords(["Graylog", "Kubernetes", "Incident"], match);
    const options: ProcessingOptions = {
      inputPath,
      outputPath: outDir,
      keywords,
      match,
      cleanup: { stripHtml: true, stripQuotedReplies: false },
      chunks: { maxEmails: 200, maxCharacters: 1_000_000 },
      formats: { jsonl: true, markdown: true },
      overwrite: true,
    };

    const engine = new ProcessingEngine(
      reader,
      new SimpleKeywordMatcher(keywords, match),
      new OutputManager(outDir, options.formats, options.chunks, true),
      new ProgressReporter("quiet"),
    );

    const summary = await engine.run(options);

    expect(reader.iterations).toBe(1); // PST traversed exactly once.
    expect(summary.status).toBe("completed");
    expect(summary.processedEmails).toBe(3);

    const graylog = await readLines(outDir, "graylog");
    const kubernetes = await readLines(outDir, "kubernetes");
    const incident = await readLines(outDir, "incident");

    // "Graylog incident follow-up" -> graylog AND incident, NOT kubernetes.
    expect(graylog).toHaveLength(1);
    expect(incident).toHaveLength(1);
    expect(kubernetes).toHaveLength(1);
    expect(graylog[0].subject).toBe("Graylog incident follow-up");
    expect(incident[0].subject).toBe("Graylog incident follow-up");
    expect(kubernetes[0].subject).toBe("Kubernetes rollout");

    // Manifest exists at root and reports counts.
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
    expect(manifest.version).toBe(1);
    expect(manifest.processedEmails).toBe(3);
    const byKeyword = Object.fromEntries(
      manifest.keywords.map((k: { keyword: string; matches: number }) => [
        k.keyword,
        k.matches,
      ]),
    );
    expect(byKeyword.Graylog).toBe(1);
    expect(byKeyword.Incident).toBe(1);
    expect(byKeyword.Kubernetes).toBe(1);
  });

  it("stops after maxEmails", async () => {
    const emails = Array.from({ length: 10 }, (_, i) => raw(`Graylog ${i}`, "", `m${i}`));
    const reader = new FakePstReader(emails);
    const keywords = compileKeywords(["Graylog"], match);
    const options: ProcessingOptions = {
      inputPath,
      outputPath: outDir,
      keywords,
      match,
      cleanup: { stripHtml: true, stripQuotedReplies: false },
      chunks: { maxEmails: 200, maxCharacters: 1_000_000 },
      formats: { jsonl: true, markdown: false },
      overwrite: true,
      maxEmails: 3,
    };
    const engine = new ProcessingEngine(
      reader,
      new SimpleKeywordMatcher(keywords, match),
      new OutputManager(outDir, options.formats, options.chunks, true),
      new ProgressReporter("quiet"),
    );
    const summary = await engine.run(options);
    expect(summary.processedEmails).toBe(3);
  });
});

async function readLines(
  outDir: string,
  slug: string,
): Promise<Array<{ subject: string }>> {
  const content = await readFile(join(outDir, slug, "emails.jsonl"), "utf8");
  return content
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}
