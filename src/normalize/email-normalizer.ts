import type { CleanupOptions, EmailRecord, RawEmail } from "../core/types.js";
import { sha256 } from "../utils/hashing.js";
import { htmlToText } from "./html-to-text.js";
import { stripQuotedReplies } from "./quoted-reply.js";

/**
 * Convert a parser-agnostic RawEmail into the canonical EmailRecord.
 *
 * Body policy (compact search/export, not Outlook reconstruction):
 *   plain text body
 *     -> unavailable: HTML body -> plain text
 *     -> unavailable: empty string
 *
 * Only the display/export body is stored; the normalized search copy is
 * produced elsewhere and never persisted.
 */
export function normalizeEmail(raw: RawEmail, cleanup: CleanupOptions): EmailRecord {
  const subject = (raw.subject ?? "").normalize("NFC");
  const body = buildBody(raw, cleanup);

  const record: EmailRecord = {
    id: computeId(raw, subject, body),
    source: {
      pstPath: raw.source.pstPath,
      folderPath: raw.source.folderPath,
      internalId: raw.source.internalId,
    },
    date: raw.date ? raw.date.toISOString() : null,
    from: raw.from,
    to: raw.to,
    cc: raw.cc,
    bcc: raw.bcc,
    subject,
    body,
    attachments: raw.attachments,
    messageId: raw.messageId,
  };

  return record;
}

function buildBody(raw: RawEmail, cleanup: CleanupOptions): string {
  let text: string;

  const plain = raw.bodyText?.trim();
  if (plain) {
    text = raw.bodyText as string;
  } else if (raw.bodyHtml && cleanup.stripHtml) {
    text = htmlToText(raw.bodyHtml);
  } else if (raw.bodyHtml) {
    // stripHtml disabled but no plain text: keep HTML as-is.
    text = raw.bodyHtml;
  } else {
    text = "";
  }

  // Normalize Unicode + line endings for the display body.
  text = text.normalize("NFC").replace(/\r\n?/g, "\n");

  if (cleanup.stripQuotedReplies) {
    text = stripQuotedReplies(text);
  }

  return text;
}

/**
 * Deterministic ID.
 *
 * Preferred: SHA256(pst identity + folder path + internal message id)
 * Fallback:  SHA256(date + from + subject + messageId + first N body chars)
 */
function computeId(raw: RawEmail, subject: string, body: string): string {
  const internalId = raw.source.internalId;
  if (internalId) {
    return sha256(raw.source.pstPath, raw.source.folderPath ?? "", internalId);
  }

  const fromKey = raw.from ? `${raw.from.name ?? ""}<${raw.from.address ?? ""}>` : "";
  return sha256(
    raw.date ? raw.date.toISOString() : "",
    fromKey,
    subject,
    raw.messageId ?? "",
    body.slice(0, 256),
  );
}
