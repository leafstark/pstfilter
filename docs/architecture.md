# Architecture

The guiding principle is a single abstraction boundary:

```
             parser-specific
                  │
                  ▼
PST → canonical EmailRecord
                  │
             parser-agnostic
                  ▼
              Matcher → Result Router → JSONL + Markdown chunks
```

Everything above `EmailRecord` is independent of the PST parsing library.

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| CLI | `src/cli/` | Parse args, validate, construct dependencies, format results. No processing logic. |
| Config resolver | `src/cli/options.ts` | Turn raw flags into a validated `ProcessingOptions`. All config errors surface here. |
| Engine | `src/core/processing-engine.ts` | Orchestrates read → normalize → match → route. Usable as a library. |
| PST adapter | `src/pst/` | The **only** place `pst-extractor` is imported. Emits parser-agnostic `RawEmail`. |
| Normalizer | `src/normalize/` | `RawEmail` → canonical `EmailRecord`; HTML→text; optional quoted-reply strip. |
| Matching | `src/matching/` | Keyword parsing, normalization, independent multi-keyword matching; bypassed by explicit `--all`. |
| Output | `src/output/` | Per-keyword JSONL + Markdown chunk writers, stats, manifest, safe filenames. |
| Progress | `src/progress/` | Throttled console progress; never prints email content. |

## Data flow

```
PstReader.messages()  ──AsyncIterable<RawEmail>──▶ normalizeEmail
        │                                              │
        │                                    EmailRecord (display body)
        │                                              │
        │                         normalizeForMatching (temporary search copy)
        │                                              │
        │                                        Matcher.match ──▶ string[] keywordIds
        │                                              │
        └──────────────────────────────▶ OutputManager.write(keywordId, email)  (0..N times)
```

The PST is traversed exactly once. Each `EmailRecord` is matched against every
keyword independently (or routed directly to `all/` in `--all` mode), sent to
zero or more output streams, then released.

## Key abstractions

- **`PstReader`** (`src/pst/pst-reader.ts`) — `open` / `messages()` / `close`.
  `PstExtractorReader` is the V1 implementation. Future adapters (`LibpffReader`,
  `ReadPstReader`, ...) can be added without touching anything upstream.
- **`Matcher`** (`src/matching/matcher.ts`) — `match(email): string[]`.
  `SimpleKeywordMatcher` is O(emails × keywords), adequate for 1–100 keywords.
  A future `AhoCorasickMatcher` can replace it without changing the engine.
- **`OutputManager`** — one logical writer per keyword, or one `all` writer for
  full exports. For the expected <100-keyword range, persistent streams are
  used (no premature LRU pooling).

## Memory model

Nothing accumulates proportionally to mailbox size:

- messages are pulled one at a time from an async generator;
- bodies are converted, matched, written and discarded immediately;
- JSONL and Markdown are streamed to disk (backpressure-aware via `drain`);
- no `allEmails`/`graylogEmails` arrays exist anywhere.

## Error handling

- **Fatal** (immediate non-zero exit): cannot open PST, unsupported format,
  cannot create output dir, no keywords or `--all`, invalid regex.
- **Recoverable** (log, increment `failedEmails`, continue): a single malformed
  message, bad date, recipient decode failure. The PST adapter catches these
  per-message and reports them via a callback.

Email bodies are never written to logs.

## Interruption

`SIGINT`/`SIGTERM` set a stop flag. The engine finishes the current message,
stops pulling new ones, flushes JSONL and finalizes Markdown chunks, writes a
manifest with `"status": "interrupted"`, and exits `130`.
