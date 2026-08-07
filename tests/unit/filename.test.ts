import { describe, expect, it } from "vitest";

import { chunkFilename, slugifyKeyword, uniqueSlug } from "../../src/output/filename.js";

describe("slugifyKeyword", () => {
  it("produces a safe lowercase slug", () => {
    expect(slugifyKeyword("Production Incident")).toBe("production-incident");
  });

  it("neutralizes path traversal and separators", () => {
    expect(slugifyKeyword("../etc/passwd")).toBe("etc-passwd");
    expect(slugifyKeyword("a/b\\c")).toBe("a-b-c");
    expect(slugifyKeyword("..")).toBe("keyword");
  });

  it("strips control characters", () => {
    expect(slugifyKeyword("bad\u0000name")).toBe("bad-name");
  });

  it("handles reserved Windows device names", () => {
    expect(slugifyKeyword("con")).toBe("keyword-con");
    expect(slugifyKeyword("LPT1")).toBe("keyword-lpt1");
  });

  it("preserves Unicode letters (e.g. Chinese)", () => {
    expect(slugifyKeyword("生产事故")).toBe("生产事故");
  });

  it("falls back to 'keyword' for empty results", () => {
    expect(slugifyKeyword("!!!")).toBe("keyword");
  });
});

describe("uniqueSlug", () => {
  it("appends numeric suffixes on collision", () => {
    const used = new Set<string>();
    expect(uniqueSlug("incident", used)).toBe("incident");
    expect(uniqueSlug("incident", used)).toBe("incident-2");
    expect(uniqueSlug("incident", used)).toBe("incident-3");
  });
});

describe("chunkFilename", () => {
  it("zero-pads to four digits", () => {
    expect(chunkFilename(1)).toBe("chunk-0001.md");
    expect(chunkFilename(42)).toBe("chunk-0042.md");
  });
});
