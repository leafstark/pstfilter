/**
 * Canonical, parser-agnostic data model.
 *
 * Everything above the PST adapter layer depends only on these types,
 * never on `pst-extractor` (or any other parser) specific structures.
 */

/** Attachment metadata only — V1 never extracts binary content. */
export interface AttachmentMetadata {
  filename: string | null;
  size?: number;
}

/** Sender information. */
export interface EmailAddress {
  name?: string;
  address?: string;
}

/**
 * The canonical email record produced by the normalization pipeline and
 * consumed by matching + output. This is what gets serialized to JSONL.
 */
export interface EmailRecord {
  id: string;

  source: {
    pstPath: string;
    folderPath: string | null;
    internalId?: string;
  };

  /** ISO-8601 string, or null when unavailable/undecodable. */
  date: string | null;

  from: EmailAddress | null;

  to: string[];
  cc: string[];
  bcc: string[];

  subject: string;

  /** Display/export body (plain text). Never the normalized search copy. */
  body: string;

  attachments: AttachmentMetadata[];

  messageId?: string;

  /** Populated by the router with the keyword ids this email matched. */
  matchedKeywords?: string[];
}

/**
 * A raw email as produced by a PstReader adapter, before normalization.
 * Bodies here may be HTML/RTF and are not yet cleaned. This is still
 * parser-agnostic — adapters convert their native message into this shape.
 */
export interface RawEmail {
  source: {
    pstPath: string;
    folderPath: string | null;
    internalId?: string;
  };
  date: Date | null;
  from: EmailAddress | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string | null;
  /** Plain text body if the message provided one. */
  bodyText: string | null;
  /** HTML body if available (used as fallback when plain text is missing). */
  bodyHtml: string | null;
  attachments: AttachmentMetadata[];
  messageId?: string;
}

/** A single compiled keyword ready for matching. */
export interface KeywordSpec {
  /** Stable identifier / safe folder slug derived from the original text. */
  id: string;
  /** Original keyword text as supplied by the user. */
  original: string;
  /** Pre-normalized substring form (unused for regex keywords). */
  normalized: string;
  /** Compiled regex when `--regex` is enabled. */
  regex?: RegExp;
}

/** A lightweight view handed to the matcher. */
export interface SearchableEmail {
  normalizedSubject: string;
  normalizedBody: string;
}

/** Where to search. */
export interface MatchOptions {
  caseSensitive: boolean;
  regex: boolean;
  subject: boolean;
  body: boolean;
}

/** Body cleanup toggles. */
export interface CleanupOptions {
  stripHtml: boolean;
  stripQuotedReplies: boolean;
}

/** Markdown chunk sizing. */
export interface ChunkConfig {
  maxEmails: number;
  maxCharacters: number;
}

/** Output format toggles. */
export interface OutputFormatOptions {
  jsonl: boolean;
  markdown: boolean;
}

/** How messages are selected for export. */
export type SelectionMode = "keywords" | "all";

/** Full options object consumed by the ProcessingEngine. */
export interface ProcessingOptions {
  inputPath: string;
  outputPath: string;

  /** Omitted programmatically means keyword matching. */
  selectionMode?: SelectionMode;
  keywords: KeywordSpec[];

  match: MatchOptions;
  cleanup: CleanupOptions;
  chunks: ChunkConfig;
  formats: OutputFormatOptions;

  overwrite: boolean;

  /** Testing/debugging cap on number of emails processed. */
  maxEmails?: number;
}

/** Per-keyword statistics written to stats.json. */
export interface KeywordStats {
  keyword: string;
  matchedEmails: number;
  markdownChunks: number;
  jsonlBytes: number;
  firstEmailDate: string | null;
  lastEmailDate: string | null;
}

export interface OutputSummary {
  perKeyword: Record<string, KeywordStats>;
}

/** Lightweight identity for the source PST. */
export interface SourceFingerprint {
  absolutePath: string;
  size: number;
  mtimeMs: number;
  head1MbHash: string;
  tail1MbHash: string;
}

export type RunStatus = "completed" | "interrupted";

/** Returned by ProcessingEngine.run(). */
export interface RunSummary {
  status: RunStatus;
  processedEmails: number;
  failedEmails: number;
  startedAt: string;
  completedAt: string;
  outputPath: string;
  perKeyword: Record<string, KeywordStats>;
}
