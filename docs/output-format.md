# Output Format

Given keywords `Graylog`, `Kubernetes`, `Incident`, the output directory looks
like:

```
output/
├── manifest.json
├── graylog/
│   ├── emails.jsonl
│   ├── stats.json
│   └── chunks/
│       ├── chunk-0001.md
│       └── ...
├── kubernetes/
│   └── ...
└── incident/
    └── ...
```

Keyword directory names are **sanitized slugs**, never the raw keyword string.
Path separators, `..`, control characters and reserved Windows device names are
neutralized; Unicode letters (including Chinese) are preserved. Collisions get a
numeric suffix (`incident`, `incident-2`).

In `--all` mode there is one output target, `all/`, containing every email in
the archive. The same JSONL, Markdown chunk, and statistics formats are used.

## `emails.jsonl`

One JSON object per line (JSONL) — appendable, streamable, and easy to process
without loading the whole file. Never a single giant JSON array.

```json
{"id":"abc123","date":"2026-06-01T12:30:00Z","from":{"name":"John","address":"john@example.com"},"to":["alice@example.com"],"cc":[],"bcc":[],"subject":"Graylog issue","body":"We found...","folderPath":"Inbox/Production","attachments":[{"filename":"logs.pdf"}],"matchedKeywords":["Graylog"]}
```

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Deterministic SHA-256; stable across re-runs when a stable internal id exists. |
| `date` | string \| null | ISO-8601, or null when unavailable. |
| `from` | object \| null | `{ name?, address? }`. |
| `to` / `cc` / `bcc` | string[] | Recipient addresses (SMTP preferred). |
| `subject` | string | NFC-normalized. |
| `body` | string | Plain text (HTML converted when needed). Display copy, not the search copy. |
| `folderPath` | string \| null | Source folder path within the PST. |
| `attachments` | object[] | `{ filename, size? }` — **metadata only**, no binaries. |
| `matchedKeywords` | string[] | Original keyword strings this email matched. |

In `--all` mode, `matchedKeywords` is always `[]` because matching is bypassed.

## `chunks/chunk-NNNN.md`

AI-friendly Markdown intended to be uploaded directly to ChatGPT / Claude. A
chunk closes when either `--chunk-emails` (default 200) or `--chunk-chars`
(default 1,000,000) is reached.

```markdown
# PSTFilter Export

Keyword: Graylog
Chunk: 3
First email: 101

---

## Email 101

Date: 2026-05-20T18:22:03Z
From: Manny <manny@example.com>
To: team@example.com
Subject: Graylog access

### Body

We have completed the Graylog configuration...

---
```

## `stats.json` (per keyword)

```json
{
  "keyword": "Graylog",
  "matchedEmails": 1284,
  "markdownChunks": 7,
  "jsonlBytes": 18372631,
  "firstEmailDate": "2021-01-15T10:00:00Z",
  "lastEmailDate": "2026-07-29T17:12:11Z"
}
```

## `manifest.json` (root)

```json
{
  "version": 1,
  "status": "completed",
  "selectionMode": "keywords",
  "source": {
    "filename": "archive.pst",
    "path": "/abs/path/archive.pst",
    "size": 7429138271,
    "fingerprint": {
      "mtimeMs": 1750000000000,
      "head1MbHash": "…",
      "tail1MbHash": "…"
    }
  },
  "processedEmails": 82431,
  "failedEmails": 17,
  "startedAt": "…",
  "completedAt": "…",
  "keywords": [
    { "keyword": "Graylog", "slug": "graylog", "matches": 1284 },
    { "keyword": "Kubernetes", "slug": "kubernetes", "matches": 3017 }
  ]
}
```

`status` is `"interrupted"` when the run was stopped with Ctrl-C. The source
fingerprint hashes only the first and last 1 MB — never the whole file — so it
is cheap even for a 50 GB PST and can back future resume verification.

`selectionMode` is `"keywords"` for filtered exports and `"all"` for explicit
full-archive conversion. In all mode, the manifest contains one output entry:
`{ "keyword": "All emails", "slug": "all", ... }`.
