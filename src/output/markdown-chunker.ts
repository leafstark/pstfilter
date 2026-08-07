import { createWriteStream, type WriteStream } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";

import { FilesystemError } from "../core/errors.js";
import type { ChunkConfig, EmailRecord } from "../core/types.js";
import { chunkFilename } from "./filename.js";

/**
 * Writes AI-friendly Markdown chunks for a single keyword. A chunk closes when
 * either the max-emails or max-characters limit is reached. Output is streamed
 * incrementally — chunks are flushed to disk as they fill.
 */
export class MarkdownChunker {
  private stream: WriteStream | null = null;
  private streamError: Error | null = null;
  private chunkIndex = 0;
  private emailsInChunk = 0;
  private charsInChunk = 0;
  private globalEmailIndex = 0;
  private chunkFirstEmailNumber = 0;

  constructor(
    private readonly chunksDir: string,
    private readonly keyword: string,
    private readonly config: ChunkConfig,
  ) {}

  /** Append one email to the current chunk, opening/rotating as needed. */
  async add(record: EmailRecord): Promise<void> {
    const block = renderEmailBlock(record, this.globalEmailIndex + 1);

    if (this.stream === null) {
      await this.openChunk();
    } else if (this.shouldRotate(block.length)) {
      await this.closeChunk();
      await this.openChunk();
    }

    await this.writeRaw(block);
    this.emailsInChunk += 1;
    this.charsInChunk += block.length;
    this.globalEmailIndex += 1;
  }

  /** Number of chunk files produced so far (including any open chunk). */
  get chunkCount(): number {
    return this.chunkIndex;
  }

  async close(): Promise<void> {
    if (this.stream !== null) {
      await this.closeChunk();
    }
  }

  private shouldRotate(nextBlockLength: number): boolean {
    if (this.emailsInChunk >= this.config.maxEmails) {
      return true;
    }
    // Rotate on character limit, but never produce an empty chunk.
    if (
      this.emailsInChunk > 0 &&
      this.charsInChunk + nextBlockLength > this.config.maxCharacters
    ) {
      return true;
    }
    return false;
  }

  private async openChunk(): Promise<void> {
    this.chunkIndex += 1;
    this.emailsInChunk = 0;
    this.charsInChunk = 0;
    this.chunkFirstEmailNumber = this.globalEmailIndex + 1;

    const path = join(this.chunksDir, chunkFilename(this.chunkIndex));
    this.stream = createWriteStream(path, { flags: "w" });
    // Capture async stream errors instead of throwing inside the event handler
    // (which would surface as an uncaught exception). Re-thrown from writeRaw()/
    // close() as a rejected Promise.
    this.stream.on("error", (err) => {
      this.streamError ??= new FilesystemError(
        `Failed writing Markdown chunk: ${path}`,
        { cause: err },
      );
    });

    const header =
      `# PSTFilter Export\n\n` +
      `Keyword: ${this.keyword}\n` +
      `Chunk: ${this.chunkIndex}\n` +
      `First email: ${this.chunkFirstEmailNumber}\n\n` +
      `---\n\n`;
    await this.writeRaw(header);
  }

  private async closeChunk(): Promise<void> {
    if (this.stream === null) {
      return;
    }
    const stream = this.stream;
    this.stream = null;
    if (this.streamError) {
      throw this.streamError;
    }
    stream.end();
    try {
      await once(stream, "finish");
    } catch (err) {
      throw new FilesystemError(`Failed writing Markdown chunk`, { cause: err });
    }
    if (this.streamError) {
      throw this.streamError;
    }
  }

  private async writeRaw(text: string): Promise<void> {
    if (this.stream === null) {
      return;
    }
    if (this.streamError) {
      throw this.streamError;
    }
    if (!this.stream.write(text)) {
      await once(this.stream, "drain");
    }
    if (this.streamError) {
      throw this.streamError;
    }
  }
}

function renderEmailBlock(record: EmailRecord, emailNumber: number): string {
  const from = formatFrom(record.from);
  const to = record.to.length > 0 ? record.to.join(", ") : "(none)";
  const lines: string[] = [
    `## Email ${emailNumber}`,
    "",
    `Date: ${record.date ?? "(unknown)"}`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${record.subject || "(no subject)"}`,
  ];

  if (record.attachments.length > 0) {
    const names = record.attachments
      .map((a) => a.filename ?? "(unnamed)")
      .join(", ");
    lines.push(`Attachments: ${names}`);
  }

  lines.push("", "### Body", "", record.body.trimEnd(), "", "---", "", "");
  return lines.join("\n");
}

function formatFrom(from: EmailRecord["from"]): string {
  if (!from) {
    return "(unknown)";
  }
  if (from.name && from.address) {
    return `${from.name} <${from.address}>`;
  }
  return from.address ?? from.name ?? "(unknown)";
}
