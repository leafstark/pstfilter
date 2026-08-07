# Performance

## Design goals

- **One scan.** The PST is traversed exactly once, regardless of keyword count.
- **Bounded memory.** Memory stays roughly constant as PST size grows:
  `7 GB PST ≠ 7 GB RAM`, `50 GB PST ≠ 50 GB RAM`.
- **Incremental output.** JSONL lines and Markdown chunks are streamed to disk;
  nothing accumulates in arrays.

## How memory stays bounded

1. `PstReader.messages()` is an async generator — one message in flight at a time.
2. Each message is normalized, matched, written, and released before the next.
3. The normalized search copy of subject/body is temporary and never stored.
4. Writers use Node stream backpressure (`drain`) rather than buffering.
5. Attachment binaries are never read — only filename/size metadata.

## Matching cost

V1 uses a straightforward `emails × keywords` loop (`SimpleKeywordMatcher`),
which is appropriate for the expected 1–100 keyword range. Because the matcher
sits behind the `Matcher` interface, an `AhoCorasickMatcher` can be dropped in
later for very large keyword sets without changing the engine.

## Benchmarking

A dedicated `benchmark` subcommand is planned. In the meantime, `--max-emails`
caps a run for quick timing checks:

```bash
pstfilter extract archive.pst --keyword test --max-emails 10000
```

When a real multi-GB benchmark is recorded it should report: messages
processed, messages/sec, peak RSS, input PST size, output size, and elapsed
time. Until then, no performance numbers are claimed here — the README will be
updated with real-world figures once measured against actual PST data.

## Things deliberately avoided

- Hashing the entire PST up front (only first/last 1 MB are fingerprinted).
- Loading the whole PST into memory.
- Scanning the PST once per keyword.
- Collecting matches into in-memory arrays before writing.
