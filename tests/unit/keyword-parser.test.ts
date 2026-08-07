import { describe, expect, it } from "vitest";

import { compileKeywords, parseKeywordsFile } from "../../src/matching/keyword-parser.js";
import { ConfigError } from "../../src/core/errors.js";
import type { MatchOptions } from "../../src/core/types.js";

const baseMatch: MatchOptions = {
  caseSensitive: false,
  regex: false,
  subject: true,
  body: true,
};

describe("parseKeywordsFile", () => {
  it("ignores blank lines and comments, keeps independent keywords", () => {
    const content = [
      "# Observability",
      "Graylog",
      "Grafana",
      "",
      "# Infrastructure",
      "Kubernetes",
      "   ",
    ].join("\n");
    expect(parseKeywordsFile(content)).toEqual(["Graylog", "Grafana", "Kubernetes"]);
  });
});

describe("compileKeywords", () => {
  it("throws ConfigError when no keywords provided", () => {
    expect(() => compileKeywords([], baseMatch)).toThrow(ConfigError);
    expect(() => compileKeywords(["  "], baseMatch)).toThrow(ConfigError);
  });

  it("assigns unique slug ids", () => {
    const specs = compileKeywords(
      ["Production Incident", "production/incident"],
      baseMatch,
    );
    expect(specs).toHaveLength(2);
    expect(specs[0]!.id).toBe("production-incident");
    expect(specs[1]!.id).toBe("production-incident-2");
  });

  it("de-duplicates case-insensitively in substring mode", () => {
    const specs = compileKeywords(["Graylog", "graylog"], baseMatch);
    expect(specs).toHaveLength(1);
  });

  it("keeps case variants distinct in case-sensitive mode", () => {
    const caseSensitive: MatchOptions = { ...baseMatch, caseSensitive: true };
    const specs = compileKeywords(["Graylog", "graylog"], caseSensitive);
    expect(specs).toHaveLength(2);
    expect(specs.map((s) => s.original)).toEqual(["Graylog", "graylog"]);
  });

  it("compiles regexes eagerly and fails fast on invalid regex", () => {
    const regexMatch: MatchOptions = { ...baseMatch, regex: true };
    expect(() => compileKeywords(["gr[aylog"], regexMatch)).toThrow(ConfigError);
  });

  it("produces working compiled regex in regex mode", () => {
    const regexMatch: MatchOptions = { ...baseMatch, regex: true };
    const specs = compileKeywords(["gr[ae]y"], regexMatch);
    expect(specs[0]!.regex).toBeInstanceOf(RegExp);
    expect(specs[0]!.regex!.test("grey")).toBe(true);
  });
});
