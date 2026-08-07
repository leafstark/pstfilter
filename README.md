# PSTFilter

A **local-first, open-source CLI** that scans very large Microsoft Outlook `.pst`
files and extracts emails whose **subject or body contains one or more
user-provided keywords**.

Each keyword produces its own independent result set. The PST is scanned only
**once**, streaming, with bounded memory — a 50 GB PST does not require 50 GB of
RAM.

- No OpenAI / Anthropic / any LLM required
- No Outlook required
- No cloud upload, no telemetry, no API keys
- Everything runs locally and offline

## Install

Requires **Node.js >= 20**.

Run it directly with `npx` (no install needed):

```bash
npx pstfilter extract archive.pst -k Graylog
```

Or install it globally:

```bash
npm install -g pstfilter
pstfilter extract archive.pst -k Graylog
```

### From source

```bash
git clone https://github.com/leafstark/pstfilter.git
cd pstfilter
npm install
npm run build
```

## Usage

```bash
pstfilter extract archive.pst \
  --keyword "Graylog" \
  --keyword "Kubernetes" \
  --keyword "Incident"
```

Or read keywords from a file:

```bash
pstfilter extract archive.pst --keywords-file keywords.txt
```

`keywords.txt` — blank lines ignored, lines beginning with `#` are comments:

```
# Observability
Graylog
Grafana

# Infrastructure
Kubernetes
```

During development you can run without building:

```bash
npm run dev -- extract archive.pst -k Graylog -o ./output
```

## Output

```
output/
├── manifest.json
├── graylog/
│   ├── emails.jsonl      # one JSON object per line (streamable)
│   ├── stats.json
│   └── chunks/
│       ├── chunk-0001.md # AI-friendly Markdown, upload to ChatGPT/Claude
│       └── ...
├── kubernetes/
│   └── ...
└── incident/
    └── ...
```

An email whose subject is `Graylog incident follow-up` is written into **both**
`output/graylog/` and `output/incident/`, but never `output/kubernetes/`.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `-k, --keyword <value>` | Keyword; repeatable | — |
| `--keywords-file <path>` | Read keywords from a text file | — |
| `-o, --output <path>` | Output directory | `./pstfilter-output` |
| `--case-sensitive` | Case-sensitive matching | off |
| `--regex` | Treat keywords as regular expressions | off |
| `--subject-only` | Search only the subject | off |
| `--body-only` | Search only the body | off |
| `--no-strip-html` | Keep HTML bodies raw instead of converting to text | (strip on) |
| `--strip-quoted-replies` | Remove quoted reply chains | off |
| `--chunk-emails <n>` | Emails per Markdown chunk | `200` |
| `--chunk-chars <n>` | Characters per Markdown chunk | `1000000` |
| `--no-jsonl` | Disable JSONL output | (jsonl on) |
| `--no-markdown` | Disable Markdown output | (markdown on) |
| `--overwrite` | Replace an existing output directory | off |
| `--quiet` / `--verbose` | Logging verbosity | normal |
| `--max-emails <n>` | Stop after N emails (testing/debugging) | — |

`--subject-only` and `--body-only` together is a configuration error.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Completed with recoverable per-email errors |
| `2` | Invalid CLI / configuration |
| `3` | PST open / parser fatal error |
| `4` | Output filesystem error |
| `130` | Interrupted by user (Ctrl-C) — partial output flushed |

## Development

```bash
npm test        # run unit + integration tests
npm run lint    # eslint
npm run typecheck
npm run build   # emit dist/
```

## Scope

V0.1 implements streaming extraction, HTML→text, independent multi-keyword
substring matching (with optional `--regex`), JSONL + Markdown output,
statistics, progress reporting, graceful error handling and Ctrl-C flushing.

Attachment binaries are **not** extracted — only filename/size metadata is
recorded. See [docs/architecture.md](docs/architecture.md) for design details
and [docs/output-format.md](docs/output-format.md) for the output contract.

## License

MIT — see [LICENSE](LICENSE).
