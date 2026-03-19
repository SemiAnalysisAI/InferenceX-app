# InferenceX Docs

Design rationale and non-obvious conventions. See [CLAUDE.md](../CLAUDE.md) for the quick-start project guide.

## Docs

- [Architecture](./architecture.md) — Why client-first, hash routing, URL state, provider nesting, caching strategy, color system, analytics enforcement
- [D3 Charts](./d3-charts.md) — Why 4 effects, in-place mutation, refs for zoom, rAF throttling, HTML tooltips, Pareto directions, gradient labels
- [Data Pipeline](./data-pipeline.md) — DB schema reasoning (JSONB+hot columns, denormalized dates, materialized view, idempotent ingestion), ETL design, transform pipeline, spline method choice
- [Pitfalls](./pitfalls.md) — Failure modes: token type consistency, schema evolution, empty objects, zoom loss, stale closures, disaggregated metrics, negative splines
- [GPU Specs](./gpu-specs.md) — Unit conventions, topology invariants, SVG layout rationale, hardware gotchas
- [TCO Calculator](./tco-calculator.md) — Why interpolation, composite keys, cost matrix, token type bugs, badge logic, state design
- [Adding Entities](./adding-entities.md) — Step-by-step checklists for adding new models, GPUs, precisions, sequences, frameworks (ingest + constants + frontend)
