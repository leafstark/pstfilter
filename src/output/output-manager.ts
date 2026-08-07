import { join } from "node:path";

import { ConfigError, FilesystemError } from "../core/errors.js";
import type {
  EmailRecord,
  KeywordSpec,
  KeywordStats,
  OutputFormatOptions,
  ChunkConfig,
} from "../core/types.js";
import { ensureDir, pathExists, removeDir } from "../utils/filesystem.js";
import { JsonlWriter } from "./jsonl-writer.js";
import { MarkdownChunker } from "./markdown-chunker.js";
import { writeStats } from "./stats-writer.js";

interface KeywordSink {
  spec: KeywordSpec;
  dir: string;
  jsonl: JsonlWriter | null;
  markdown: MarkdownChunker | null;
  matchedEmails: number;
  firstEmailDate: string | null;
  lastEmailDate: string | null;
}

/**
 * One logical writer per keyword. For the expected <100 keyword range,
 * persistent streams are acceptable (no LRU pooling in V1).
 */
export class OutputManager {
  private sinks = new Map<string, KeywordSink>();

  constructor(
    private readonly outputPath: string,
    private readonly formats: OutputFormatOptions,
    private readonly chunks: ChunkConfig,
    private readonly overwrite: boolean,
  ) {}

  /** Create output directories and open per-keyword writers. */
  async initialize(keywords: KeywordSpec[]): Promise<void> {
    if (await pathExists(this.outputPath)) {
      if (!this.overwrite) {
        throw new ConfigError(
          `Output directory already exists: ${this.outputPath} (use --overwrite to replace)`,
        );
      }
      await removeDir(this.outputPath);
    }

    await ensureDir(this.outputPath);

    for (const spec of keywords) {
      const dir = join(this.outputPath, spec.id);
      await ensureDir(dir);

      let markdown: MarkdownChunker | null = null;
      if (this.formats.markdown) {
        const chunksDir = join(dir, "chunks");
        await ensureDir(chunksDir);
        markdown = new MarkdownChunker(chunksDir, spec.original, this.chunks);
      }

      const sink: KeywordSink = {
        spec,
        dir,
        jsonl: this.formats.jsonl ? new JsonlWriter(dir) : null,
        markdown,
        matchedEmails: 0,
        firstEmailDate: null,
        lastEmailDate: null,
      };
      this.sinks.set(spec.id, sink);
    }
  }

  /** Route one matched email to a keyword's writers. */
  async write(keywordId: string, email: EmailRecord): Promise<void> {
    const sink = this.sinks.get(keywordId);
    if (!sink) {
      throw new FilesystemError(`Unknown keyword id for output: ${keywordId}`);
    }

    if (sink.jsonl) {
      await sink.jsonl.write(email);
    }
    if (sink.markdown) {
      await sink.markdown.add(email);
    }

    sink.matchedEmails += 1;
    if (email.date) {
      if (sink.firstEmailDate === null || email.date < sink.firstEmailDate) {
        sink.firstEmailDate = email.date;
      }
      if (sink.lastEmailDate === null || email.date > sink.lastEmailDate) {
        sink.lastEmailDate = email.date;
      }
    }
  }

  /** Close all writers and emit per-keyword stats.json. */
  async finalize(): Promise<Record<string, KeywordStats>> {
    const perKeyword: Record<string, KeywordStats> = {};

    for (const sink of this.sinks.values()) {
      await sink.markdown?.close();
      await sink.jsonl?.close();

      const stats: KeywordStats = {
        keyword: sink.spec.original,
        matchedEmails: sink.matchedEmails,
        markdownChunks: sink.markdown?.chunkCount ?? 0,
        jsonlBytes: sink.jsonl?.bytes ?? 0,
        firstEmailDate: sink.firstEmailDate,
        lastEmailDate: sink.lastEmailDate,
      };

      await writeStats(sink.dir, stats);
      perKeyword[sink.spec.id] = stats;
    }

    return perKeyword;
  }
}
