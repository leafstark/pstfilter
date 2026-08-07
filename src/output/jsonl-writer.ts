import { createWriteStream, type WriteStream } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";

import { FilesystemError } from "../core/errors.js";
import type { EmailRecord } from "../core/types.js";

/**
 * Appends EmailRecords to a keyword's emails.jsonl, one JSON object per line.
 * Streaming + append-only — never buffers all records in memory.
 */
export class JsonlWriter {
  private stream: WriteStream;
  private path: string;
  private bytesWritten = 0;
  private closed = false;
  private streamError: Error | null = null;

  constructor(dir: string) {
    this.path = join(dir, "emails.jsonl");
    this.stream = createWriteStream(this.path, { flags: "w" });
    // Capture async stream errors instead of throwing inside the event handler
    // (which would surface as an uncaught exception). The stored error is
    // re-thrown from write()/close() as a rejected Promise.
    this.stream.on("error", (err) => {
      this.streamError ??= new FilesystemError(`Failed writing JSONL: ${this.path}`, {
        cause: err,
      });
    });
  }

  /** Write one record. Returns after the chunk is accepted by the stream. */
  async write(record: EmailRecord): Promise<void> {
    if (this.streamError) {
      throw this.streamError;
    }
    const line = JSON.stringify(toJsonlShape(record)) + "\n";
    const buf = Buffer.from(line, "utf8");
    this.bytesWritten += buf.byteLength;
    if (!this.stream.write(buf)) {
      await once(this.stream, "drain");
    }
    if (this.streamError) {
      throw this.streamError;
    }
  }

  get bytes(): number {
    return this.bytesWritten;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.streamError) {
      throw this.streamError;
    }
    this.stream.end();
    try {
      await once(this.stream, "finish");
    } catch (err) {
      throw new FilesystemError(`Failed writing JSONL: ${this.path}`, { cause: err });
    }
    if (this.streamError) {
      throw this.streamError;
    }
  }
}

/** Flatten the record into the documented compact JSONL shape. */
function toJsonlShape(record: EmailRecord): Record<string, unknown> {
  return {
    id: record.id,
    date: record.date,
    from: record.from,
    to: record.to,
    cc: record.cc,
    bcc: record.bcc,
    subject: record.subject,
    body: record.body,
    folderPath: record.source.folderPath,
    attachments: record.attachments,
    matchedKeywords: record.matchedKeywords ?? [],
  };
}
