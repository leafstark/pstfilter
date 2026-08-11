import { describe, expect, it } from "vitest";

import { resolveConfig, type RawExtractOptions } from "../../src/cli/options.js";
import { ConfigError } from "../../src/core/errors.js";

function raw(overrides: Partial<RawExtractOptions> = {}): RawExtractOptions {
  return {
    keyword: [],
    all: false,
    output: "./output",
    caseSensitive: false,
    regex: false,
    subjectOnly: false,
    bodyOnly: false,
    stripHtml: true,
    stripQuotedReplies: false,
    chunkEmails: "200",
    chunkChars: "1000000",
    jsonl: true,
    markdown: true,
    overwrite: false,
    quiet: false,
    verbose: false,
    ...overrides,
  };
}

describe("resolveConfig selection mode", () => {
  it("requires an explicit keyword source or --all", async () => {
    await expect(resolveConfig("archive.pst", raw())).rejects.toThrow(
      "Use --keyword, --keywords-file, or --all",
    );
  });

  it("configures a single all-emails output target", async () => {
    const { options } = await resolveConfig("archive.pst", raw({ all: true }));

    expect(options.selectionMode).toBe("all");
    expect(options.keywords).toEqual([
      { id: "all", original: "All emails", normalized: "" },
    ]);
  });

  it("rejects --all with inline keywords", async () => {
    await expect(
      resolveConfig("archive.pst", raw({ all: true, keyword: ["Graylog"] })),
    ).rejects.toThrow(ConfigError);
  });

  it("rejects --all with a keywords file before reading it", async () => {
    await expect(
      resolveConfig(
        "archive.pst",
        raw({ all: true, keywordsFile: "does-not-exist.txt" }),
      ),
    ).rejects.toThrow("--all cannot be used with --keyword or --keywords-file");
  });
});
