import { describe, expect, it } from "vitest";

import {
  SimpleKeywordMatcher,
  normalizeForMatching,
} from "../../src/matching/keyword-matcher.js";
import { compileKeywords } from "../../src/matching/keyword-parser.js";
import type { MatchOptions, SearchableEmail } from "../../src/core/types.js";

const baseMatch: MatchOptions = {
  caseSensitive: false,
  regex: false,
  subject: true,
  body: true,
};

function searchable(subject: string, body: string): SearchableEmail {
  return {
    normalizedSubject: normalizeForMatching(subject),
    normalizedBody: normalizeForMatching(body),
  };
}

describe("normalizeForMatching", () => {
  it("lowercases, normalizes line endings, and collapses whitespace", () => {
    expect(normalizeForMatching("  Kubernetes\r\nIncident ")).toBe(
      " kubernetes\nincident ",
    );
  });

  it("preserves case when caseSensitive is true", () => {
    expect(normalizeForMatching("Graylog", { caseSensitive: true })).toBe("Graylog");
  });

  it("applies Unicode NFC normalization", () => {
    // "é" as e + combining accent should normalize to single codepoint.
    const decomposed = "cafe\u0301";
    expect(normalizeForMatching(decomposed)).toBe("café");
  });
});

describe("SimpleKeywordMatcher", () => {
  it("matches keyword in subject (case-insensitive)", () => {
    const keywords = compileKeywords(["graylog"], baseMatch);
    const matcher = new SimpleKeywordMatcher(keywords, baseMatch);
    expect(matcher.match(searchable("Graylog access issue", ""))).toEqual([
      keywords[0]!.id,
    ]);
  });

  it("matches keyword in body (case-insensitive)", () => {
    const keywords = compileKeywords(["graylog"], baseMatch);
    const matcher = new SimpleKeywordMatcher(keywords, baseMatch);
    expect(
      matcher.match(searchable("", "We checked the GRAYLOG configuration.")),
    ).toEqual([keywords[0]!.id]);
  });

  it("CRITICAL: returns every independently matching keyword", () => {
    const keywords = compileKeywords(["graylog", "incident", "kubernetes"], baseMatch);
    const matcher = new SimpleKeywordMatcher(keywords, baseMatch);
    const result = matcher.match(searchable("Graylog Incident", ""));

    const originals = result.map((id) => keywords.find((k) => k.id === id)!.original);
    expect(originals).toEqual(["graylog", "incident"]);
    expect(originals).not.toContain("kubernetes");
  });

  it("respects case-sensitive matching", () => {
    const csMatch: MatchOptions = { ...baseMatch, caseSensitive: true };
    const keywords = compileKeywords(["Graylog"], csMatch);
    const matcher = new SimpleKeywordMatcher(keywords, csMatch);

    const cs = (subject: string): SearchableEmail => ({
      normalizedSubject: normalizeForMatching(subject, { caseSensitive: true }),
      normalizedBody: "",
    });

    expect(matcher.match(cs("Graylog issue"))).toHaveLength(1);
    expect(matcher.match(cs("graylog issue"))).toHaveLength(0);
  });

  it("honors subject-only matching", () => {
    const opts: MatchOptions = { ...baseMatch, body: false };
    const keywords = compileKeywords(["graylog"], opts);
    const matcher = new SimpleKeywordMatcher(keywords, opts);
    expect(
      matcher.match({
        normalizedSubject: "",
        normalizedBody: normalizeForMatching("graylog in body"),
      }),
    ).toHaveLength(0);
  });

  it("honors body-only matching", () => {
    const opts: MatchOptions = { ...baseMatch, subject: false };
    const keywords = compileKeywords(["graylog"], opts);
    const matcher = new SimpleKeywordMatcher(keywords, opts);
    expect(
      matcher.match({
        normalizedSubject: normalizeForMatching("graylog subject"),
        normalizedBody: "",
      }),
    ).toHaveLength(0);
  });

  it("matches Chinese keywords", () => {
    const keywords = compileKeywords(["生产事故"], baseMatch);
    const matcher = new SimpleKeywordMatcher(keywords, baseMatch);
    expect(matcher.match(searchable("关于生产事故的报告", ""))).toEqual([
      keywords[0]!.id,
    ]);
  });

  it("supports regex matching when enabled", () => {
    const opts: MatchOptions = { ...baseMatch, regex: true };
    const keywords = compileKeywords(["gr[ae]ylog"], opts);
    const matcher = new SimpleKeywordMatcher(keywords, opts);
    expect(matcher.match(searchable("greylog notice", ""))).toHaveLength(1);
    expect(matcher.match(searchable("graylog notice", ""))).toHaveLength(1);
    expect(matcher.match(searchable("splunk notice", ""))).toHaveLength(0);
  });
});
