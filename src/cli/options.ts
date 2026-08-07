import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ConfigError } from "../core/errors.js";
import type { ProcessingOptions } from "../core/types.js";
import { compileKeywords, parseKeywordsFile } from "../matching/keyword-parser.js";
import type { LogLevel } from "../progress/progress-reporter.js";

/** Raw option values as collected by commander for the `extract` command. */
export interface RawExtractOptions {
  keyword?: string[];
  keywordsFile?: string;
  output: string;
  caseSensitive: boolean;
  regex: boolean;
  subjectOnly: boolean;
  bodyOnly: boolean;
  stripHtml: boolean;
  stripQuotedReplies: boolean;
  chunkEmails: string;
  chunkChars: string;
  jsonl: boolean;
  markdown: boolean;
  overwrite: boolean;
  quiet: boolean;
  verbose: boolean;
  maxEmails?: string;
}

export interface ResolvedConfig {
  options: ProcessingOptions;
  logLevel: LogLevel;
}

/**
 * Validate + resolve raw CLI flags into a fully-formed ProcessingOptions.
 * All configuration errors (exit code 2) surface here, before any PST work.
 */
export async function resolveConfig(
  pstFile: string,
  raw: RawExtractOptions,
): Promise<ResolvedConfig> {
  if (raw.subjectOnly && raw.bodyOnly) {
    throw new ConfigError("--subject-only and --body-only cannot be used together.");
  }

  if (raw.quiet && raw.verbose) {
    throw new ConfigError("--quiet and --verbose cannot be used together.");
  }

  if (!raw.jsonl && !raw.markdown) {
    throw new ConfigError(
      "At least one output format must be enabled (--jsonl or --markdown).",
    );
  }

  const rawKeywords = await collectKeywords(raw);
  if (rawKeywords.length === 0) {
    throw new ConfigError("No keywords provided. Use --keyword or --keywords-file.");
  }

  const match = {
    caseSensitive: raw.caseSensitive,
    regex: raw.regex,
    subject: !raw.bodyOnly,
    body: !raw.subjectOnly,
  };

  const keywords = compileKeywords(rawKeywords, match);

  const chunkEmails = parsePositiveInt(raw.chunkEmails, "--chunk-emails");
  const chunkChars = parsePositiveInt(raw.chunkChars, "--chunk-chars");
  const maxEmails =
    raw.maxEmails !== undefined
      ? parsePositiveInt(raw.maxEmails, "--max-emails")
      : undefined;

  const options: ProcessingOptions = {
    inputPath: resolve(pstFile),
    outputPath: resolve(raw.output),
    keywords,
    match,
    cleanup: {
      stripHtml: raw.stripHtml,
      stripQuotedReplies: raw.stripQuotedReplies,
    },
    chunks: {
      maxEmails: chunkEmails,
      maxCharacters: chunkChars,
    },
    formats: {
      jsonl: raw.jsonl,
      markdown: raw.markdown,
    },
    overwrite: raw.overwrite,
    maxEmails,
  };

  const logLevel: LogLevel = raw.quiet ? "quiet" : raw.verbose ? "verbose" : "normal";

  return { options, logLevel };
}

async function collectKeywords(raw: RawExtractOptions): Promise<string[]> {
  const keywords: string[] = [...(raw.keyword ?? [])];

  if (raw.keywordsFile) {
    let content: string;
    try {
      content = await readFile(resolve(raw.keywordsFile), "utf8");
    } catch (err) {
      throw new ConfigError(
        `Cannot read keywords file: ${raw.keywordsFile} (${errMessage(err)})`,
      );
    }
    keywords.push(...parseKeywordsFile(content));
  }

  return keywords;
}

function parsePositiveInt(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ConfigError(`${flag} must be a positive integer (got "${value}").`);
  }
  return n;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
