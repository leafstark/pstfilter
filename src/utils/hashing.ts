import { createHash } from "node:crypto";

/** SHA-256 hex digest of the given inputs joined with a null separator. */
export function sha256(...parts: (string | Buffer)[]): string {
  const hash = createHash("sha256");
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) {
      hash.update("\u0000");
    }
    hash.update(parts[i] as string | Buffer);
  }
  return hash.digest("hex");
}
