import { ConfigError } from "../core/errors.js";
import type { KeywordSpec, MatchOptions } from "../core/types.js";
import { normalizeForMatching } from "./keyword-matcher.js";
import { slugifyKeyword, uniqueSlug } from "../output/filename.js";

/**
 * Parse raw keyword lines coming from a --keywords-file.
 *
 * - Blank lines are ignored.
 * - Lines beginning with `#` are comments.
 * - Every other line is an independent keyword (trimmed).
 */
export function parseKeywordsFile(content: string): string[] {
  const keywords: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    keywords.push(line);
  }
  return keywords;
}

/**
 * Compile user-provided keyword strings into KeywordSpec[].
 *
 * Responsibilities:
 * - de-duplicate exact duplicates (after trimming)
 * - assign unique, filesystem-safe slug ids
 * - precompute normalized substring form
 * - compile regexes eagerly when regex mode is on (invalid regex fails fast)
 */
export function compileKeywords(
  rawKeywords: string[],
  match: MatchOptions,
): KeywordSpec[] {
  const trimmed = rawKeywords.map((k) => k.trim()).filter((k) => k.length > 0);

  if (trimmed.length === 0) {
    throw new ConfigError("No keywords provided.");
  }

  const seen = new Set<string>();
  const usedSlugs = new Set<string>();
  const specs: KeywordSpec[] = [];

  for (const original of trimmed) {
    // De-duplicate case-insensitively only for case-insensitive substring mode.
    // Regex and case-sensitive modes must keep e.g. `Graylog` and `graylog`
    // distinct.
    const dedupeKey =
      match.regex || match.caseSensitive ? original : original.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const id = uniqueSlug(slugifyKeyword(original), usedSlugs);

    const spec: KeywordSpec = {
      id,
      original,
      normalized: normalizeForMatching(original, {
        caseSensitive: match.caseSensitive,
      }),
    };

    if (match.regex) {
      spec.regex = compileRegex(original, match.caseSensitive);
    }

    specs.push(spec);
  }

  return specs;
}

function compileRegex(pattern: string, caseSensitive: boolean): RegExp {
  const flags = caseSensitive ? "" : "i";
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Invalid regular expression "${pattern}": ${reason}`);
  }
}
