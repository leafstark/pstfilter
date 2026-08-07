import { createReadStream } from "node:fs";
import { open, rm, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { FilesystemError } from "../core/errors.js";
import type { SourceFingerprint } from "../core/types.js";
import { sha256 } from "./hashing.js";

/** Create a directory (recursively), mapping failures to FilesystemError. */
export async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    throw new FilesystemError(`Cannot create directory: ${path}`, { cause: err });
  }
}

/** Remove a directory tree if it exists. */
export async function removeDir(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (err) {
    throw new FilesystemError(`Cannot remove directory: ${path}`, { cause: err });
  }
}

/** True if the path exists (file or directory). */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute a lightweight fingerprint of the source PST without hashing the
 * entire file. Hashes only the first and last 1 MB.
 */
export async function fingerprintFile(path: string): Promise<SourceFingerprint> {
  const absolutePath = resolve(path);
  let size: number;
  let mtimeMs: number;
  try {
    const st = await stat(absolutePath);
    size = st.size;
    mtimeMs = st.mtimeMs;
  } catch (err) {
    throw new FilesystemError(`Cannot stat input file: ${absolutePath}`, {
      cause: err,
    });
  }

  const oneMb = 1024 * 1024;
  const headHash = await hashRange(absolutePath, 0, Math.min(oneMb, size));
  const tailStart = size > oneMb ? size - oneMb : 0;
  const tailHash = await hashRange(absolutePath, tailStart, size);

  return {
    absolutePath,
    size,
    mtimeMs,
    head1MbHash: headHash,
    tail1MbHash: tailHash,
  };
}

async function hashRange(path: string, start: number, end: number): Promise<string> {
  if (end <= start) {
    return sha256("");
  }
  return new Promise<string>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(path, { start, end: end - 1 });
    stream.on("data", (c) => chunks.push(c as Buffer));
    stream.on("error", reject);
    stream.on("end", () => resolvePromise(sha256(Buffer.concat(chunks))));
  });
}

/** Re-export for callers that just need a typed file handle helper. */
export { open as openFile };
