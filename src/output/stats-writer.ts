import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { FilesystemError } from "../core/errors.js";
import type {
  KeywordSpec,
  KeywordStats,
  RunStatus,
  SelectionMode,
  SourceFingerprint,
} from "../core/types.js";

/** Write a keyword's stats.json. */
export async function writeStats(dir: string, stats: KeywordStats): Promise<void> {
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
  selectionMode: SelectionMode;
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
  const path = join(input.outputPath, "manifest.json");

  const currentKeywords = input.keywords.map((spec) => ({
    keyword: spec.original,
    slug: spec.id,
    matches: input.perKeyword[spec.id]?.matchedEmails ?? 0,
  }));

  // A run only writes its own subdirectories, so merge this run's keywords into
  // any keywords recorded by earlier runs to keep the manifest consistent with
  // everything present on disk. Entries for the same slug are refreshed.
  const keywords = await mergeManifestKeywords(path, currentKeywords);

  const manifest = {
    version: 1,
    status: input.status,
    selectionMode: input.selectionMode,
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
    keywords,
  };

  try {
    await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  } catch (err) {
    throw new FilesystemError(`Failed writing manifest: ${path}`, { cause: err });
  }
}

interface ManifestKeyword {
  keyword: string;
  slug: string;
  matches: number;
}

/**
 * Union the current run's keywords with those from an existing manifest.json,
 * keeping the earlier ordering and overriding entries that share a slug. A
 * missing or unreadable manifest is treated as an empty set.
 */
async function mergeManifestKeywords(
  path: string,
  current: ManifestKeyword[],
): Promise<ManifestKeyword[]> {
  const bySlug = new Map<string, ManifestKeyword>();

  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as unknown;
    const prior = (existing as { keywords?: unknown })?.keywords;
    if (Array.isArray(prior)) {
      for (const entry of prior) {
        if (isManifestKeyword(entry)) {
          bySlug.set(entry.slug, entry);
        }
      }
    }
  } catch {
    // No existing manifest, or it is unreadable/corrupt: start fresh.
  }

  for (const entry of current) {
    bySlug.set(entry.slug, entry);
  }

  return [...bySlug.values()];
}

function isManifestKeyword(value: unknown): value is ManifestKeyword {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.keyword === "string" &&
    typeof v.slug === "string" &&
    typeof v.matches === "number"
  );
}
