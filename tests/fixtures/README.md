# Test Fixtures

Small `.pst` fixtures for integration testing go here. They are intentionally
kept out of version control by default (see `.gitignore` — `*.pst`).

Recommended fixtures to cover once a PST generation approach is chosen:

- plain-text email
- HTML email
- nested-folder email
- email with an attachment (metadata only is asserted)
- email matching two keywords
- email matching no keywords
- very long body
- Unicode subject/body
- Chinese keyword (e.g. `生产事故`)

The pure pipeline (normalize → match → output) is already covered without real
PST files via `tests/integration/engine.test.ts`, which uses an in-memory
`FakePstReader`.
