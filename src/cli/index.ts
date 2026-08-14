#!/usr/bin/env node
import { Command, Option } from "commander";

import { PstFilterError, ExitCode } from "../core/errors.js";
import { VERSION } from "../version.js";
import { runExtract } from "./commands/extract.js";
import type { RawExtractOptions } from "./options.js";

function buildProgram(): Command {
  const program = new Command();

  program
    .name("pstfilter")
    .description("Filter or convert large Outlook .pst files into JSONL and Markdown.")
    .version(VERSION, "-V, --version", "Print version and exit");

  program
    .command("extract", { isDefault: true })
    .description("Filter matching emails or export every email from a PST file")
    .argument("<pst-file>", "Path to the input .pst file")
    .option("-k, --keyword <value>", "Keyword to match (repeatable)", collect, [])
    .option("--keywords-file <path>", "Read keywords from a text file")
    .option("--all", "Export all emails without keyword filtering", false)
    .option("-o, --output <path>", "Output directory", "./pstfilter-output")
    .option("--case-sensitive", "Case-sensitive matching", false)
    .option("--regex", "Treat keywords as regular expressions", false)
    .option("--subject-only", "Search only the subject", false)
    .option("--body-only", "Search only the body", false)
    .option("--no-strip-html", "Do not convert HTML bodies to text")
    .option("--strip-quoted-replies", "Remove quoted reply chains from bodies", false)
    .option("--chunk-emails <number>", "Emails per Markdown chunk", "200")
    .option("--chunk-chars <number>", "Characters per Markdown chunk", "1000000")
    .option("--no-jsonl", "Disable JSONL output")
    .option("--no-markdown", "Disable Markdown chunk output")
    .option(
      "--overwrite",
      "Replace this run's output subdirectories if they already exist",
      false,
    )
    .addOption(new Option("--quiet", "Minimal logging").default(false))
    .addOption(new Option("--verbose", "Detailed technical logging").default(false))
    .option("--max-emails <number>", "Stop after N emails (testing/debugging only)")
    .action(async (pstFile: string, opts: Record<string, unknown>) => {
      const raw = toRawOptions(opts);
      const code = await runExtract(pstFile, raw);
      process.exitCode = code;
    });

  return program;
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

/** Map commander's parsed options onto our typed RawExtractOptions. */
function toRawOptions(opts: Record<string, unknown>): RawExtractOptions {
  return {
    keyword: (opts.keyword as string[]) ?? [],
    keywordsFile: opts.keywordsFile as string | undefined,
    all: Boolean(opts.all),
    output: opts.output as string,
    caseSensitive: Boolean(opts.caseSensitive),
    regex: Boolean(opts.regex),
    subjectOnly: Boolean(opts.subjectOnly),
    bodyOnly: Boolean(opts.bodyOnly),
    // commander sets `stripHtml` true unless --no-strip-html given.
    stripHtml: opts.stripHtml !== false,
    stripQuotedReplies: Boolean(opts.stripQuotedReplies),
    chunkEmails: String(opts.chunkEmails),
    chunkChars: String(opts.chunkChars),
    jsonl: opts.jsonl !== false,
    markdown: opts.markdown !== false,
    overwrite: Boolean(opts.overwrite),
    quiet: Boolean(opts.quiet),
    verbose: Boolean(opts.verbose),
    maxEmails: opts.maxEmails as string | undefined,
  };
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof PstFilterError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = err.exitCode;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Unexpected error: ${message}\n`);
    process.exitCode = ExitCode.ParserFatal;
  }
}

void main();
