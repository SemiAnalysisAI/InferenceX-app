# InferenceX Docs

Design rationale and non-obvious conventions. See [CLAUDE.md](../CLAUDE.md) for the quick-start project guide.

## Docs

- [API Skill Examples](./inferencex-api-examples.md) — Install the public skill, query benchmarks, export measured PowerX data, and explain empty results
- [PowerX System Power](./powerx-system-power.md) — Pinned chassis model, measured-input guards, assumptions, and reproducible article exports
- [API Skill Releases](./inferencex-skills-release.md) — Prepare an immutable package, verify clean installations and agent exports, and publish through the package-specific workflow
- [API Skill Discovery](./inferencex-skills-discovery.md) — Accept or reject implicit skill discovery in fresh Codex and Claude Code projects
- [CLI Compatibility](./inferencex-cli-compatibility.md) — Contract 1 schemas, bundle and exit semantics, platform scope, and legacy migration
- [CLI Release Checklist](./inferencex-cli-release-checklist.md) — Candidate evidence and ordered publication gates

- [Architecture](./architecture.md) — Why client-first, route navigation, URL state, provider nesting, server-side caching (unstable_cache + blob), in-memory client cache, color system, analytics enforcement
- [D3 Charts](./d3-charts.md) — Why 4 effects, in-place mutation, refs for zoom, rAF throttling, HTML tooltips, Pareto directions, gradient labels
- [Overview Data Integrity](./overview-data-integrity.md) — Verified throughput contract, minimum-SLO selection, date provenance, refresh behavior, and safe repair procedure
- [Data Pipeline](./data-pipeline.md) — DB schema reasoning, ETL design, transform pipeline, spline method choice, normalizer resolution order (model/GPU/framework)
- [Pitfalls](./pitfalls.md) — Failure modes: token type consistency, schema evolution, empty objects, zoom loss, stale closures, disaggregated metrics, negative splines, date stamping, ref stability, cost inheritance
- [GPU Specs](./gpu-specs.md) — Unit conventions, topology invariants, SVG layout rationale, hardware gotchas
- [TCO Calculator](./tco-calculator.md) — Why interpolation, composite keys, cost matrix, token type bugs, badge logic, state design
- [Adding Entities](./adding-entities.md) — Step-by-step checklists for adding new models, GPUs, precisions, sequences, frameworks (ingest + constants + frontend), plus featuring a day-0 model (launch banner, modal, Quick Comparisons preset)
- [Testing](./testing.md) — Requirements, quality standards, pre-commit checklist
- [Typography](./typography.md) — Type tokens (text-2xs/3xs, named tracking), Heading/Eyebrow components, TS-based chart font sizes, and the check:typography ratchet gate + allowlist burndown
- [Data Transforms](./data-transforms.md) — Full pipeline from BenchmarkRow to RenderableGraph: type hierarchy, hardware key construction, derived metrics, memoization strategy
- [State Ownership](./state-ownership.md) — Which context owns which state, availability filtering cascade, comparison date mechanics, URL param sync
- [Blog](./blog.md) — MDX content system, SEO features (OG images, RSS, llms.txt, JSON-LD), TOC sidebar, reading progress, heading links, analytics events
- [CollectiveX](./collectivex.md) — lazy ingest-on-read pipeline (separate Neon DB as a durable GitHub-artifact cache), tombstoned deletes, raw-docs storage + shared reader
- [Chinese Pages (/zh)](./i18n.md) — Why hand-authored /zh pages instead of an i18n framework, hreflang pairing, blog translation pairing, html lang workaround, CJK reading time/slugs
- [Chinese Copy Editorial Guide](./chinese-copy.md) — Audience, surface-specific register, context-aware terminology, rewrite workflow, manual-review process, and PR checklist
