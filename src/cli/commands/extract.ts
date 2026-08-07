import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { ProcessingEngine } from "../../core/processing-engine.js";
import { ExitCode } from "../../core/errors.js";
import type { RunSummary } from "../../core/types.js";
import { SimpleKeywordMatcher } from "../../matching/keyword-matcher.js";
import { OutputManager } from "../../output/output-manager.js";
import { ProgressReporter } from "../../progress/progress-reporter.js";
import { PstExtractorReader } from "../../pst/pst-extractor-reader.js";
import { VERSION } from "../../version.js";
import { resolveConfig, type RawExtractOptions } from "../options.js";

/**
 * Execute the `extract` command. Returns the process exit code.
 *
 * The CLI layer only: resolves config, constructs dependencies, runs the
 * engine, and formats results. No PST logic lives here.
 */
export async function runExtract(
  pstFile: string,
  raw: RawExtractOptions,
): Promise<number> {
  const { options, logLevel } = await resolveConfig(pstFile, raw);

  const inputSize = await fileSize(options.inputPath);

  if (logLevel !== "quiet") {
    printHeader(pstFile, inputSize, options.keywords.length);
  }

  const progress = new ProgressReporter(logLevel);
  const reader = new PstExtractorReader({
    onMessageError: () => {
      progress.recordFailure();
    },
  });
  const matcher = new SimpleKeywordMatcher(options.keywords, options.match);
  const output = new OutputManager(
    options.outputPath,
    options.formats,
    options.chunks,
    options.overwrite,
  );

  const engine = new ProcessingEngine(reader, matcher, output, progress);

  // Ctrl-C / SIGTERM: ask the engine to stop, then let it flush cleanly.
  const onSignal = () => {
    progress.warn("Interruption requested — flushing output...");
    engine.requestStop();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  let summary: RunSummary;
  try {
    summary = await engine.run(options);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }

  if (logLevel !== "quiet") {
    printSummary(options, summary);
  }

  if (summary.status === "interrupted") {
    return ExitCode.Interrupted;
  }
  if (summary.failedEmails > 0) {
    return ExitCode.RecoverableErrors;
  }
  return ExitCode.Success;
}

function printHeader(pstFile: string, size: number | null, keywordCount: number): void {
  const lines = [
    `PSTFilter ${VERSION}`,
    "",
    `Input: ${basename(pstFile)}`,
    `Size: ${size !== null ? formatBytes(size) : "(unknown)"}`,
    `Keywords: ${keywordCount}`,
    "",
  ];
  process.stderr.write(lines.join("\n") + "\n");
}

function printSummary(
  options: { outputPath: string; keywords: { id: string; original: string }[] },
  summary: RunSummary,
): void {
  const out: string[] = [];
  out.push("Matches:");

  const maxLen = Math.max(...options.keywords.map((k) => k.original.length), 4);
  for (const spec of options.keywords) {
    const stats = summary.perKeyword[spec.id];
    const count = stats ? stats.matchedEmails : 0;
    out.push(
      `  ${spec.original.padEnd(maxLen)}  ${count.toLocaleString().padStart(8)} emails`,
    );
  }

  out.push("");
  if (summary.failedEmails > 0) {
    out.push(`Recoverable failures: ${summary.failedEmails.toLocaleString()}`);
  }
  if (summary.status === "interrupted") {
    out.push("Status: interrupted (partial output written)");
  }
  out.push("");
  out.push("Output written to:");
  out.push(summary.outputPath);
  out.push("");

  process.stdout.write(out.join("\n") + "\n");
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const st = await stat(path);
    return st.size;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
