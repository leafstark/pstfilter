import type { RawEmail } from "../core/types.js";

/**
 * Parser-agnostic reader abstraction. The rest of the application depends only
 * on this interface — never on `pst-extractor` directly. Additional adapters
 * (LibpffReader, ReadPstReader, ...) can be added later without touching the
 * matching/output pipeline.
 */
export interface PstReader {
  /** Open the PST at `path`. Throws ParserFatalError on unrecoverable failure. */
  open(path: string): Promise<void>;

  /**
   * Stream messages one at a time as parser-agnostic RawEmail objects.
   * Implementations must not buffer the whole PST in memory.
   */
  messages(): AsyncIterable<RawEmail>;

  /** Release parser resources / file descriptors. */
  close(): Promise<void>;
}

/** Raised by a reader for a single unparseable message (recoverable). */
export class MessageParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MessageParseError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
