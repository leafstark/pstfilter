import { describe, expect, it } from "vitest";

import { htmlToText } from "../../src/normalize/html-to-text.js";
import { normalizeEmail } from "../../src/normalize/email-normalizer.js";
import { stripQuotedReplies } from "../../src/normalize/quoted-reply.js";
import type { CleanupOptions, RawEmail } from "../../src/core/types.js";

const cleanup: CleanupOptions = { stripHtml: true, stripQuotedReplies: false };

function rawEmail(overrides: Partial<RawEmail>): RawEmail {
  return {
    source: { pstPath: "/tmp/a.pst", folderPath: "Inbox", internalId: "42" },
    date: new Date("2026-06-01T12:30:00Z"),
    from: { name: "John", address: "john@example.com" },
    to: ["alice@example.com"],
    cc: [],
    bcc: [],
    subject: "Hello",
    bodyText: "plain body",
    bodyHtml: null,
    attachments: [],
    ...overrides,
  };
}

describe("htmlToText", () => {
  it("converts HTML to readable text and drops links/images", () => {
    const text = htmlToText(
      '<p>Hello <a href="http://x">world</a></p><img src="http://y"/>',
    );
    expect(text).toContain("Hello world");
    expect(text).not.toContain("http://x");
    expect(text).not.toContain("http://y");
  });
});

describe("normalizeEmail body policy", () => {
  it("prefers plain text body", () => {
    const rec = normalizeEmail(
      rawEmail({ bodyText: "plain", bodyHtml: "<p>html</p>" }),
      cleanup,
    );
    expect(rec.body).toBe("plain");
  });

  it("falls back to HTML converted to text", () => {
    const rec = normalizeEmail(
      rawEmail({ bodyText: null, bodyHtml: "<p>from html</p>" }),
      cleanup,
    );
    expect(rec.body).toContain("from html");
  });

  it("yields empty string when no body available", () => {
    const rec = normalizeEmail(rawEmail({ bodyText: null, bodyHtml: null }), cleanup);
    expect(rec.body).toBe("");
  });

  it("keeps HTML raw when stripHtml disabled and no plain text", () => {
    const rec = normalizeEmail(rawEmail({ bodyText: null, bodyHtml: "<p>raw</p>" }), {
      stripHtml: false,
      stripQuotedReplies: false,
    });
    expect(rec.body).toContain("<p>raw</p>");
  });
});

describe("normalizeEmail id determinism", () => {
  it("produces stable ids for identical input", () => {
    const a = normalizeEmail(rawEmail({}), cleanup);
    const b = normalizeEmail(rawEmail({}), cleanup);
    expect(a.id).toBe(b.id);
  });

  it("uses internal id when available (independent of body)", () => {
    const a = normalizeEmail(rawEmail({ bodyText: "one" }), cleanup);
    const b = normalizeEmail(rawEmail({ bodyText: "two" }), cleanup);
    expect(a.id).toBe(b.id);
  });

  it("derives fallback id from content when internal id missing", () => {
    const base = rawEmail({});
    base.source.internalId = undefined;
    const a = normalizeEmail({ ...base, bodyText: "one" }, cleanup);
    const b = normalizeEmail({ ...base, bodyText: "two" }, cleanup);
    expect(a.id).not.toBe(b.id);
  });
});

describe("normalizeEmail unicode & attachments", () => {
  it("normalizes Unicode subject and stores attachment metadata only", () => {
    const rec = normalizeEmail(
      rawEmail({
        subject: "关于生产事故",
        attachments: [{ filename: "logs.pdf", size: 1234 }],
      }),
      cleanup,
    );
    expect(rec.subject).toBe("关于生产事故");
    expect(rec.attachments).toEqual([{ filename: "logs.pdf", size: 1234 }]);
  });
});

describe("stripQuotedReplies", () => {
  it("removes content after an attribution line", () => {
    const body = [
      "Thanks.",
      "",
      "On Monday John wrote:",
      "> Original message",
      "> Older original",
    ].join("\n");
    expect(stripQuotedReplies(body)).toBe("Thanks.");
  });

  it("returns body unchanged when no quote boundary present", () => {
    const body = "Just a normal message.";
    expect(stripQuotedReplies(body)).toBe(body);
  });
});
