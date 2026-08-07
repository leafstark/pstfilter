import type { KeywordSpec, MatchOptions, SearchableEmail } from "../core/types.js";
import type { Matcher } from "./matcher.js";

/**
 * Single normalization function used to build the temporary search copy of
 * subject/body. The result is never written to disk.
 *
 * Steps:
 *   1. Unicode NFC normalization
 *   2. normalize CRLF/CR -> LF
 *   3. optional lowercase (skipped when case-sensitive)
 *   4. collapse runs of horizontal whitespace to a single space
 *
 * Note: newlines are preserved (only collapsed with adjacent spaces/tabs) so
 * that multi-line semantics remain intact for the search copy.
 */
export function normalizeForMatching(
  value: string,
  options: { caseSensitive?: boolean } = {},
): string {
  let out = value.normalize("NFC");
  out = out.replace(/\r\n?/g, "\n");
  if (!options.caseSensitive) {
    out = out.toLowerCase();
  }
  // Collapse runs of spaces/tabs and other unusual horizontal whitespace,
  // but keep newlines.
  out = out.replace(/[^\S\n]+/g, " ");
  return out;
}

/**
 * Simple O(emails × keywords) matcher. Adequate for the expected 1–100
 * keyword range. Supports substring and regex modes.
 */
export class SimpleKeywordMatcher implements Matcher {
  constructor(
    private readonly keywords: KeywordSpec[],
    private readonly options: MatchOptions,
  ) {}

  match(email: SearchableEmail): string[] {
    const matched: string[] = [];
    const { subject, body, regex } = this.options;

    for (const keyword of this.keywords) {
      let hit = false;

      if (regex) {
        const re = keyword.regex;
        if (re) {
          // Reset lastIndex defensively in case a global flag slipped in.
          re.lastIndex = 0;
          if (subject && re.test(email.normalizedSubject)) {
            hit = true;
          } else {
            re.lastIndex = 0;
            if (body && re.test(email.normalizedBody)) {
              hit = true;
            }
          }
        }
      } else {
        const needle = keyword.normalized;
        if (subject && email.normalizedSubject.includes(needle)) {
          hit = true;
        } else if (body && email.normalizedBody.includes(needle)) {
          hit = true;
        }
      }

      if (hit) {
        matched.push(keyword.id);
      }
    }

    return matched;
  }
}
