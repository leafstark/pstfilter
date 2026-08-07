import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Single source of truth for the CLI/library version. Read from package.json at
 * runtime so `npm version` bumps are reflected without editing source.
 *
 * Works both when compiled (dist/version.js -> ../package.json) and when run
 * from source via tsx (src/version.ts -> ../package.json).
 */
function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf8"),
    ) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readVersion();
