/**
 * Public library surface. The core is usable programmatically, not only via
 * the CLI (constraint #12).
 */
export * from "./core/types.js";
export * from "./core/errors.js";
export { ProcessingEngine } from "./core/processing-engine.js";

export type { Matcher } from "./matching/matcher.js";
export {
  SimpleKeywordMatcher,
  normalizeForMatching,
} from "./matching/keyword-matcher.js";
export { compileKeywords, parseKeywordsFile } from "./matching/keyword-parser.js";

export { normalizeEmail } from "./normalize/email-normalizer.js";
export { htmlToText } from "./normalize/html-to-text.js";
export { stripQuotedReplies } from "./normalize/quoted-reply.js";

export { OutputManager } from "./output/output-manager.js";
export { slugifyKeyword } from "./output/filename.js";

export type { PstReader } from "./pst/pst-reader.js";
export { PstExtractorReader } from "./pst/pst-extractor-reader.js";

export { ProgressReporter } from "./progress/progress-reporter.js";
