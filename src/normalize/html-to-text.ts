import { convert } from "html-to-text";

/**
 * Convert an HTML body into readable plain text. Configured to avoid emitting
 * link URLs and images (keeps output compact and avoids leaking tracking URLs
 * into exports).
 */
export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
    ],
  });
}
