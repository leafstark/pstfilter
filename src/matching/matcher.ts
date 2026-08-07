import type { SearchableEmail } from "../core/types.js";

/**
 * Matcher abstraction. The ProcessingEngine depends on this interface only,
 * so an AhoCorasickMatcher can replace SimpleKeywordMatcher later without any
 * changes upstream.
 */
export interface Matcher {
  /** Returns the ids of every keyword that matches (independent matching). */
  match(email: SearchableEmail): string[];
}
