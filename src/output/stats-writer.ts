import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { FilesystemError } from "../core/errors.js";
import type {
  KeywordSpec,
  KeywordStats,
  RunStatus,
  SourceFingerprint,
} from "../core/types.js";

/** Write a keyword's stats.json. */
export async function writeStats(
  dir: string,
  stats: KeywordStats,
): Promise<void> {
  const path = join(dir, "stats.json");
  try {
    await writeFile(path, JSON.stringify(stats, null, 2) + "\n", "utf8");
  } catch (err) {
    throw new FilesystemError(`Failed writing stats: ${path}`, { cause: err });
  }
}

export interface ManifestInput {
  outputPath: string;
  fingerprint: SourceFingerprint;
  keywords: KeywordSpec[];
  perKeyword: Record<string, KeywordStats>;
  processedEmails: number;
  failedEmails: number;
  startedAt: string;
  completedAt: string;
  status: RunStatus;
}

/** Write the root manifest.json. */
export async function writeManifest(input: ManifestInput): Promise<void> {
  const manifest = {
    version: 1,
    status: input.status,
    source: {
      filename: basename(input.fingerprint.absolutePath),
      path: input.fingerprint.absolutePath,
      size: input.fingerprint.size,
      fingerprint: {
        mtimeMs: input.fingerprint.mtimeMs,
        head1MbHash: input.fingerprint.head1MbHash,
        tail1MbHash: input.fingerprint.tail1MbHash,
      },
    },
    processedEmails: input.processedEmails,
    failedEmails: input.failedEmails,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    keywords: input.keywords.map((spec) => ({
      keyword: spec.original,
      slug: spec.id,
      matches: input.perKeyword[spec.id]?.matchedEmails ?? 0,
    })),
  };

  const path = join(input.outputPath, "manifest.json");
  try {
    await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  } catch (err) {
    throw new FilesystemError(`Failed writing manifest: ${path}`, { cause: err });
  }
}
