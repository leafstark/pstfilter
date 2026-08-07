/**
 * Console progress reporting. Emits periodic in-place updates during scanning
 * and a final summary. Respects --quiet and --verbose.
 *
 * Never prints email bodies or subjects (security requirement).
 */

export type LogLevel = "quiet" | "normal" | "verbose";

export class ProgressReporter {
  private processed = 0;
  private failed = 0;
  private startTime = 0;
  private lastRender = 0;
  private readonly isTty: boolean;

  constructor(private readonly level: LogLevel = "normal") {
    this.isTty = Boolean(process.stderr.isTTY);
  }

  start(): void {
    this.startTime = Date.now();
    this.processed = 0;
    this.failed = 0;
    if (this.level !== "quiet") {
      process.stderr.write("Scanning...\n\n");
    }
  }

  tick(): void {
    this.processed += 1;
    if (this.level === "quiet") {
      return;
    }
    const now = Date.now();
    // Throttle rendering to ~4 times/sec.
    if (now - this.lastRender < 250) {
      return;
    }
    this.lastRender = now;
    this.render();
  }

  recordFailure(): void {
    this.failed += 1;
  }

  get processedCount(): number {
    return this.processed;
  }

  get failedCount(): number {
    return this.failed;
  }

  private render(): void {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const line = `Emails processed: ${this.processed.toLocaleString()}   Elapsed: ${elapsed}`;
    if (this.isTty) {
      process.stderr.write(`\r${line}`);
    } else {
      process.stderr.write(`${line}\n`);
    }
  }

  finish(): void {
    if (this.level === "quiet") {
      return;
    }
    if (this.isTty) {
      process.stderr.write("\r");
      // Clear the line.
      process.stderr.write("\u001b[K");
    }
    const elapsed = formatDuration(Date.now() - this.startTime);
    process.stderr.write(`Emails processed: ${this.processed.toLocaleString()}\n`);
    process.stderr.write(`Elapsed: ${elapsed}\n\n`);
  }

  /** Structured log for verbose mode (never includes email content). */
  debug(message: string): void {
    if (this.level === "verbose") {
      process.stderr.write(`[verbose] ${message}\n`);
    }
  }

  warn(message: string): void {
    if (this.level !== "quiet") {
      process.stderr.write(`[warn] ${message}\n`);
    }
  }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
