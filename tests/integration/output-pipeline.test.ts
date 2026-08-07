import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OutputManager } from "../../src/output/output-manager.js";
import type {
  ChunkConfig,
  EmailRecord,
  KeywordSpec,
  OutputFormatOptions,
} from "../../src/core/types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pstfilter-out-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function record(n: number): EmailRecord {
  return {
    id: `id-${n}`,
    source: { pstPath: "/tmp/a.pst", folderPath: "Inbox" },
    date: `2026-06-${String((n % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    from: { name: "John", address: "john@example.com" },
    to: ["team@example.com"],
    cc: [],
    bcc: [],
    subject: `Subject ${n}`,
    body: `Body number ${n}`,
    attachments: [],
    matchedKeywords: ["Graylog"],
  };
}

const keywords: KeywordSpec[] = [
  { id: "graylog", original: "Graylog", normalized: "graylog" },
];

const formats: OutputFormatOptions = { jsonl: true, markdown: true };

describe("OutputManager pipeline", () => {
  it("writes JSONL, chunked Markdown, stats and finalizes", async () => {
    const chunks: ChunkConfig = { maxEmails: 2, maxCharacters: 1_000_000 };
    const om = new OutputManager(dir, formats, chunks, true);
    await om.initialize(keywords);

    for (let i = 1; i <= 5; i += 1) {
      await om.write("graylog", record(i));
    }
    const perKeyword = await om.finalize();

    // JSONL: 5 lines, each valid JSON with matchedKeywords.
    const jsonl = await readFile(join(dir, "graylog", "emails.jsonl"), "utf8");
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(5);
    const first = JSON.parse(lines[0]!);
    expect(first.matchedKeywords).toEqual(["Graylog"]);
    expect(first.folderPath).toBe("Inbox");

    // Markdown: 5 emails / 2 per chunk = 3 chunks.
    const chunkFiles = (await readdir(join(dir, "graylog", "chunks"))).sort();
    expect(chunkFiles).toEqual(["chunk-0001.md", "chunk-0002.md", "chunk-0003.md"]);

    const chunk1 = await readFile(
      join(dir, "graylog", "chunks", "chunk-0001.md"),
      "utf8",
    );
    expect(chunk1).toContain("Keyword: Graylog");
    expect(chunk1).toContain("## Email 1");
    expect(chunk1).toContain("## Email 2");
    expect(chunk1).not.toContain("## Email 3");

    // Stats.
    expect(perKeyword.graylog!.matchedEmails).toBe(5);
    expect(perKeyword.graylog!.markdownChunks).toBe(3);
    expect(perKeyword.graylog!.jsonlBytes).toBeGreaterThan(0);
    expect(perKeyword.graylog!.firstEmailDate).not.toBeNull();
  });

  it("rejects existing output dir without overwrite", async () => {
    const chunks: ChunkConfig = { maxEmails: 2, maxCharacters: 1_000_000 };
    const om1 = new OutputManager(dir, formats, chunks, false);
    // dir already exists (created by mkdtemp) -> should throw.
    await expect(om1.initialize(keywords)).rejects.toThrow();
  });

  it("closes a chunk on character limit", async () => {
    const chunks: ChunkConfig = { maxEmails: 1000, maxCharacters: 200 };
    const om = new OutputManager(dir, formats, chunks, true);
    await om.initialize(keywords);
    for (let i = 1; i <= 6; i += 1) {
      await om.write("graylog", record(i));
    }
    await om.finalize();
    const chunkFiles = await readdir(join(dir, "graylog", "chunks"));
    expect(chunkFiles.length).toBeGreaterThan(1);
  });
});
