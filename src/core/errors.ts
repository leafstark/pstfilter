/**
 * Typed error hierarchy mapped to deterministic CLI exit codes.
 *
 *   0   success
 *   1   completed with recoverable email errors
 *   2   invalid CLI/configuration
 *   3   PST open/parser fatal error
 *   4   output filesystem error
 *   130 interrupted by user
 */

export const ExitCode = {
  Success: 0,
  RecoverableErrors: 1,
  Config: 2,
  ParserFatal: 3,
  Filesystem: 4,
  Interrupted: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Base class for all errors that carry an explicit exit code. */
export class PstFilterError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

/** Invalid CLI arguments / configuration (exit 2). */
export class ConfigError extends PstFilterError {
  constructor(message: string) {
    super(message, ExitCode.Config);
  }
}

/** PST cannot be opened / unsupported format (exit 3). */
export class ParserFatalError extends PstFilterError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, ExitCode.ParserFatal);
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Output directory / write failures (exit 4). */
export class FilesystemError extends PstFilterError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, ExitCode.Filesystem);
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Raised internally when the user interrupts the run (exit 130). */
export class InterruptedError extends PstFilterError {
  constructor(message = "Interrupted by user") {
    super(message, ExitCode.Interrupted);
  }
}
