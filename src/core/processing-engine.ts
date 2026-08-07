import { normalizeEmail } from "../normalize/email-normalizer.js";
import { normalizeForMatching } from "../matching/keyword-matcher.js";
import type { Matcher } from "../matching/matcher.js";
import type { OutputManager } from "../output/output-manager.js";
import type { ProgressReporter } from "../progress/progress-reporter.js";
import type { PstReader } from "../pst/pst-reader.js";
import { writeManifest } from "../output/stats-writer.js";
import { fingerprintFile, pathExists } from "../utils/filesystem.js";
import { ParserFatalError } from "./errors.js";
import type { ProcessingOptions, RunSummary, SearchableEmail } from "./types.js";

/**
 * Core orchestration. Lives outside CLI code so it can be used as a library.
 *
 * Pipeline:
 *   PST reader -> normalize -> matcher -> result router (OutputManager)
 *
 * The PST is traversed exactly once; each email is matched against every
 * keyword independently and routed to 0..N output streams, then released.
 * Memory stays bounded regardless of PST size.
 */
export class ProcessingEngine {
  private stopRequested = false;

  constructor(
    private readonly reader: PstReader,
    private readonly matcher: Matcher,
    private readonly output: OutputManager,
    private readonly progress: ProgressReporter,
  ) {}

  /** Ask the engine to stop pulling new emails and flush cleanly (Ctrl-C). */
  requestStop(): void {
    this.stopRequested = true;
  }

  async run(options: ProcessingOptions): Promise<RunSummary> {
    const startedAt = new Date().toISOString();

    if (!(await pathExists(options.inputPath))) {
      throw new ParserFatalError(`Input PST not found: ${options.inputPath}`);
    }

    const fingerprint = await fingerprintFile(options.inputPath);

    await this.reader.open(options.inputPath);
    await this.output.initialize(options.keywords);

    this.progress.start();

    let interrupted = false;

    try {
      for await (const raw of this.reader.messages()) {
        if (this.stopRequested) {
          interrupted = true;
          break;
        }

        if (
          options.maxEmails !== undefined &&
          this.progress.processedCount >= options.maxEmails
        ) {
          break;
        }

        try {
          const email = normalizeEmail(raw, options.cleanup);
          const searchable = this.toSearchable(email, options);
          const matched = this.matcher.match(searchable);

          if (matched.length > 0) {
            email.matchedKeywords = matched.map((id) =>
              this.keywordOriginal(options, id),
            );
            for (const keywordId of matched) {
              await this.output.write(keywordId, email);
            }
          }
        } catch (err) {
          this.progress.recordFailure();
          this.progress.debug(
            `Recoverable error processing a message: ${errMessage(err)}`,
          );
        }

        this.progress.tick();
      }
    } finally {
      await this.reader.close();
    }

    this.progress.finish();

    const perKeyword = await this.output.finalize();
    const completedAt = new Date().toISOString();
    const status = interrupted ? "interrupted" : "completed";

    await writeManifest({
      outputPath: options.outputPath,
      fingerprint,
      keywords: options.keywords,
      perKeyword,
      processedEmails: this.progress.processedCount,
      failedEmails: this.progress.failedCount,
      startedAt,
      completedAt,
      status,
    });

    return {
      status,
      processedEmails: this.progress.processedCount,
      failedEmails: this.progress.failedCount,
      startedAt,
      completedAt,
      outputPath: options.outputPath,
      perKeyword,
    };
  }

  private toSearchable(
    email: { subject: string; body: string },
    options: ProcessingOptions,
  ): SearchableEmail {
    const caseSensitive = options.match.caseSensitive;
    return {
      normalizedSubject: options.match.subject
        ? normalizeForMatching(email.subject, { caseSensitive })
        : "",
      normalizedBody: options.match.body
        ? normalizeForMatching(email.body, { caseSensitive })
        : "",
    };
  }

  private keywordOriginal(options: ProcessingOptions, id: string): string {
    const spec = options.keywords.find((k) => k.id === id);
    return spec ? spec.original : id;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
