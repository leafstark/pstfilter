/**
 * Optional quoted-reply removal. Disabled by default (V1 prioritizes
 * correctness over smaller output). Enabled via --strip-quoted-replies.
 *
 * Heuristics are intentionally conservative:
 * - stop at the first common "On <date>, <person> wrote:" attribution line
 * - stop at a run of quoted (`>`-prefixed) lines
 * - stop at common Outlook header separators (e.g. "-----Original Message-----",
 *   "From:" header blocks)
 *
 * Everything after the first detected boundary is dropped.
 */

const ATTRIBUTION_PATTERNS: RegExp[] = [
  /^On .+ wrote:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^_{5,}\s*$/,
  /^From:\s.+$/i,
  /^发件人[:：]/,
  /^在.+写道[:：]?\s*$/,
];

export function stripQuotedReplies(body: string): string {
  const lines = body.split("\n");
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();

    if (ATTRIBUTION_PATTERNS.some((re) => re.test(line))) {
      cutIndex = i;
      break;
    }

    // A block of quoted lines starting with ">".
    if (line.startsWith(">")) {
      cutIndex = i;
      break;
    }
  }

  if (cutIndex === -1) {
    return body;
  }

  return lines.slice(0, cutIndex).join("\n").trimEnd();
}
