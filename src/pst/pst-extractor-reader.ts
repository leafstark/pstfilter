import { PSTFile, PSTFolder, PSTMessage, PSTRecipient } from "pst-extractor";

import { ParserFatalError } from "../core/errors.js";
import type { AttachmentMetadata, EmailAddress, RawEmail } from "../core/types.js";
import { PstReader } from "./pst-reader.js";

/** MAPI recipient type constants. */
const MAPI_TO = 1;
const MAPI_CC = 2;
const MAPI_BCC = 3;

export interface PstExtractorReaderOptions {
  /**
   * Called for each individual message that cannot be parsed. The scan
   * continues (recoverable). Bodies are never passed to this callback.
   */
  onMessageError?: (info: { folderPath: string | null; error: unknown }) => void;
}

/**
 * PstReader implementation backed by the `pst-extractor` library.
 *
 * This is the ONLY module allowed to import `pst-extractor`. Everything it
 * exposes to the rest of the app is expressed as parser-agnostic RawEmail.
 *
 * Traversal is depth-first and streaming: messages are yielded one at a time
 * and released immediately, keeping memory bounded regardless of PST size.
 */
export class PstExtractorReader implements PstReader {
  private pstFile: PSTFile | null = null;
  private pstPath = "";

  constructor(private readonly options: PstExtractorReaderOptions = {}) {}

  async open(path: string): Promise<void> {
    this.pstPath = path;
    try {
      this.pstFile = new PSTFile(path);
    } catch (err) {
      throw new ParserFatalError(`Cannot open PST file: ${path}`, { cause: err });
    }
  }

  async *messages(): AsyncIterable<RawEmail> {
    if (!this.pstFile) {
      throw new ParserFatalError("PST file not opened");
    }

    let root: PSTFolder;
    try {
      root = this.pstFile.getRootFolder();
    } catch (err) {
      throw new ParserFatalError("Cannot read PST root folder", { cause: err });
    }

    yield* this.walkFolder(root, null);
  }

  async close(): Promise<void> {
    if (this.pstFile) {
      try {
        // Some versions expose close(); guard defensively.
        (this.pstFile as unknown as { close?: () => void }).close?.();
      } catch {
        // Closing best-effort; ignore.
      }
      this.pstFile = null;
    }
  }

  private *walkFolder(folder: PSTFolder, parentPath: string | null): Generator<RawEmail> {
    const name = safeCall(() => folder.displayName) ?? "";
    const folderPath =
      parentPath === null
        ? name || null // root folder contributes no path segment when unnamed
        : name
          ? `${parentPath}/${name}`
          : parentPath;

    // Emit messages in this folder.
    if (safeCall(() => folder.contentCount) ?? 0 > 0) {
      // getNextChild() advances an internal cursor; loop until null.
      for (;;) {
        let child: PSTMessage | null;
        try {
          child = folder.getNextChild() as PSTMessage | null;
        } catch (err) {
          this.options.onMessageError?.({ folderPath, error: err });
          break;
        }
        if (!child) {
          break;
        }
        const raw = this.tryConvert(child, folderPath);
        if (raw) {
          yield raw;
        }
      }
    }

    // Recurse into subfolders.
    let subFolders: PSTFolder[] = [];
    try {
      if (folder.hasSubfolders) {
        subFolders = folder.getSubFolders();
      }
    } catch (err) {
      this.options.onMessageError?.({ folderPath, error: err });
      subFolders = [];
    }

    for (const sub of subFolders) {
      yield* this.walkFolder(sub, folderPath);
    }
  }

  private tryConvert(message: PSTMessage, folderPath: string | null): RawEmail | null {
    try {
      return this.convert(message, folderPath);
    } catch (err) {
      this.options.onMessageError?.({ folderPath, error: err });
      return null;
    }
  }

  private convert(message: PSTMessage, folderPath: string | null): RawEmail {
    const bodyText = nonEmpty(safeCall(() => message.body));
    const bodyHtml = nonEmpty(safeCall(() => message.bodyHTML));

    const from = this.extractFrom(message);
    const { to, cc, bcc } = this.extractRecipients(message);
    const attachments = this.extractAttachments(message);

    return {
      source: {
        pstPath: this.pstPath,
        folderPath,
        internalId: this.extractInternalId(message),
      },
      date: safeCall(() => message.clientSubmitTime) ?? null,
      from,
      to,
      cc,
      bcc,
      subject: nonEmpty(safeCall(() => message.subject)),
      bodyText,
      bodyHtml,
      attachments,
      messageId: nonEmpty(safeCall(() => message.internetMessageId)) ?? undefined,
    };
  }

  private extractFrom(message: PSTMessage): EmailAddress | null {
    const name = nonEmpty(safeCall(() => message.senderName));
    const address =
      nonEmpty(safeCall(() => message.senderEmailAddress)) ??
      nonEmpty(safeCall(() => message.senderEmailAddress));
    if (!name && !address) {
      return null;
    }
    const from: EmailAddress = {};
    if (name) {
      from.name = name;
    }
    if (address) {
      from.address = address;
    }
    return from;
  }

  private extractRecipients(message: PSTMessage): {
    to: string[];
    cc: string[];
    bcc: string[];
  } {
    const to: string[] = [];
    const cc: string[] = [];
    const bcc: string[] = [];

    const count = safeCall(() => message.numberOfRecipients) ?? 0;
    for (let i = 0; i < count; i += 1) {
      let recipient: PSTRecipient | null = null;
      try {
        recipient = message.getRecipient(i);
      } catch {
        continue;
      }
      if (!recipient) {
        continue;
      }
      const address = formatRecipient(recipient);
      if (!address) {
        continue;
      }
      const type = safeCall(() => recipient.recipientType) ?? MAPI_TO;
      if (type === MAPI_CC) {
        cc.push(address);
      } else if (type === MAPI_BCC) {
        bcc.push(address);
      } else {
        to.push(address);
      }
    }

    return { to, cc, bcc };
  }

  private extractAttachments(message: PSTMessage): AttachmentMetadata[] {
    const attachments: AttachmentMetadata[] = [];
    const count = safeCall(() => message.numberOfAttachments) ?? 0;
    for (let i = 0; i < count; i += 1) {
      try {
        const att = message.getAttachment(i);
        const filename =
          nonEmpty(safeCall(() => att.longFilename)) ??
          nonEmpty(safeCall(() => att.filename)) ??
          null;
        const size = safeCall(() => att.filesize);
        const meta: AttachmentMetadata = { filename };
        if (typeof size === "number" && size >= 0) {
          meta.size = size;
        }
        attachments.push(meta);
      } catch {
        // Attachment metadata is best-effort; skip broken entries.
      }
    }
    return attachments;
  }

  private extractInternalId(message: PSTMessage): string | undefined {
    const nodeId = safeCall(
      () =>
        (message as unknown as { descriptorNode?: { descriptorIdentifier?: number } })
          .descriptorNode?.descriptorIdentifier,
    );
    if (typeof nodeId === "number") {
      return String(nodeId);
    }
    return undefined;
  }
}

/** Run a getter that may throw / access native internals; return undefined on error. */
function safeCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function nonEmpty(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function formatRecipient(recipient: PSTRecipient): string | null {
  const smtp = nonEmpty(safeCall(() => recipient.smtpAddress));
  const email = nonEmpty(safeCall(() => recipient.emailAddress));
  const display = nonEmpty(safeCall(() => recipient.displayName));
  return smtp ?? email ?? display ?? null;
}
