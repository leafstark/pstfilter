import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { ConfigError } from "../core/errors.js";
import type { ProcessingOptions } from "../core/types.js";
import { compileKeywords, parseKeywordsFile } from "../matching/keyword-parser.js";
import type { LogLevel } from "../progress/progress-reporter.js";

/** Raw option values as collected by commander for the `extract` command. */
export interface RawExtractOptions {
  keyword?: string[];
  keywordsFile?: string;
  all: boolean;
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

  if (raw.all && ((raw.keyword?.length ?? 0) > 0 || raw.keywordsFile)) {
    throw new ConfigError("--all cannot be used with --keyword or --keywords-file.");
  }

  const rawKeywords = raw.all ? [] : await collectKeywords(raw);
  if (!raw.all && rawKeywords.length === 0) {
    throw new ConfigError(
      "No keywords provided. Use --keyword, --keywords-file, or --all.",
    );
  }

  const match = {
    caseSensitive: raw.caseSensitive,
    regex: raw.regex,
    subject: !raw.bodyOnly,
    body: !raw.subjectOnly,
  };

  const keywords = raw.all
    ? [{ id: "all", original: "All emails", normalized: "" }]
    : compileKeywords(rawKeywords, match);

  const chunkEmails = parsePositiveInt(raw.chunkEmails, "--chunk-emails");
  const chunkChars = parsePositiveInt(raw.chunkChars, "--chunk-chars");
  const maxEmails =
    raw.maxEmails !== undefined
      ? parsePositiveInt(raw.maxEmails, "--max-emails")
      : undefined;

  const options: ProcessingOptions = {
    inputPath: resolve(pstFile),
    outputPath: resolve(raw.output),
    selectionMode: raw.all ? "all" : "keywords",
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

  assertSafeOutputPath(options.inputPath, options.outputPath, raw.overwrite);

  const logLevel: LogLevel = raw.quiet ? "quiet" : raw.verbose ? "verbose" : "normal";

  return { options, logLevel };
}

/**
 * Guard against destructive `--overwrite` mistakes. Per-run subdirectories are
 * wiped before writing, so refuse output paths that would delete the input PST
 * or an important enclosing/working directory.
 */
function assertSafeOutputPath(
  inputPath: string,
  outputPath: string,
  overwrite: boolean,
): void {
  if (outputPath === inputPath) {
    throw new ConfigError("Output path cannot be the input PST file.");
  }

  // If the output directory contains the input PST, removing it (with
  // --overwrite) would delete the source file.
  if (isInside(inputPath, outputPath)) {
    throw new ConfigError(
      "Output path cannot contain the input PST file; --overwrite would delete it.",
    );
  }

  if (!overwrite) {
    return;
  }

  const cwd = resolve(process.cwd());
  const root = resolve("/");

  if (outputPath === root) {
    throw new ConfigError("Refusing to use --overwrite on the filesystem root.");
  }
  if (outputPath === cwd || isInside(cwd, outputPath)) {
    throw new ConfigError(
      "Refusing to use --overwrite on the current working directory or a parent of it. Use a dedicated output directory.",
    );
  }
}

/** True if `child` is `parent` itself or nested somewhere below `parent`. */
function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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
