/**
 * Filesystem-safe name generation. Keyword strings are never trusted directly
 * as paths — they are sanitized against traversal, control characters, and
 * reserved Windows device names.
 */

const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/**
 * Turn arbitrary keyword text into a safe directory slug.
 *
 * - lowercase
 * - Unicode letters/digits kept; everything else becomes a hyphen
 * - collapse/trim hyphens
 * - reject `.` / `..` / reserved device names
 * - guarantee a non-empty result
 */
export function slugifyKeyword(keyword: string): string {
  let slug = keyword.normalize("NFC").toLowerCase();

  // Replace path separators, control chars, and other unsafe chars.
  // Keep Unicode letters/numbers (so Chinese keywords survive), and a few
  // safe separators which are then normalized to hyphens.
  slug = slug.replace(/[^\p{L}\p{N}]+/gu, "-");

  // Collapse and trim hyphens.
  slug = slug.replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  if (slug === "" || slug === "." || slug === "..") {
    return "keyword";
  }

  if (RESERVED_WINDOWS_NAMES.has(slug)) {
    return `keyword-${slug}`;
  }

  // Bound length to avoid path-length issues on some filesystems.
  if (slug.length > 100) {
    slug = slug.slice(0, 100).replace(/-+$/g, "");
  }

  return slug;
}

/**
 * Ensure uniqueness among a set of already-used slugs by appending a numeric
 * suffix. Keeps deterministic ordering for reproducible output.
 */
export function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  let candidate = `${base}-${i}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}`;
  }
  used.add(candidate);
  return candidate;
}

/** Zero-padded chunk filename, e.g. chunk-0001.md */
export function chunkFilename(index: number): string {
  return `chunk-${String(index).padStart(4, "0")}.md`;
}
