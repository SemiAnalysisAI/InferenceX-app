# InferenceX Docs

Design rationale and non-obvious conventions. Repo-wide rules are in [AGENTS.md](../AGENTS.md).

## Docs

- [App Source Organization](./source-organization.md) covers import and refactor conventions for app source.

- [API Skill Examples](./inferencex-api-examples.md) shows how to install the public API skill, query benchmarks, and export measured PowerX data.
- [PowerX System Power](./powerx-system-power.md) covers the modeled chassis and rack power, its assumptions, and the offline comparison export.
- [PowerX Permanent View](./powerx-permanent-view.md) covers the measured-energy power metrics, their share links, and the power timeline.
- [API Skill Releases](./inferencex-skills-release.md) is the runbook for preparing, verifying, publishing, and recovering `inferencex-skills` releases.
- [API Skill Discovery](./inferencex-skills-discovery.md) is the acceptance protocol for implicit skill discovery in fresh Codex and Claude Code projects.
- [CLI Compatibility](./inferencex-cli-compatibility.md) covers the CLI contract, exit semantics, platform scope, and legacy migration.

- [Architecture](./architecture.md) explains the client-first data flow, deliberate API exceptions, URL state, and caching choices.
- [D3 Charts](./d3-charts.md) covers render phases, zoom and tooltip behavior, animation, and Pareto highlights.
- [Data Pipeline](./data-pipeline.md) covers DB schema and migration rules, ETL design, audited purges and backfills, and agentic and PowerX storage.
- [Ingesting Runs](./ingesting-runs.md) is the runbook for manually ingesting a GitHub Actions benchmark run.
- [Deployment Configuration](./deployment-configuration.md) lists the optional environment variables, product flags, and GitHub variables with their defaults.
- [GPU Specs](./gpu-specs.md) covers unit conventions, topology invariants, and hardware gotchas.
- [TCO Calculator](./tco-calculator.md) covers the calculator's interpolation, cost metrics, unofficial-run overlays, and estimator design.
- [Adding Entities](./adding-entities.md) has the checklists for adding models, GPUs, precisions, sequences, and frameworks.
- [Testing](./testing.md) covers test requirements, quality standards, and the pre-commit checklist.
- [Site Search](./site-search.md) covers how header search indexes and ranks pages, plus its performance and SEO guarantees.
- [Typography](./typography.md) covers type tokens, heading components, chart font sizes, and the `check:typography` gate.
- [Data Transforms](./data-transforms.md) covers power boundaries, prefix-cache tier shares, and hardware-key gotchas in the chart data pipeline.
- [State Ownership](./state-ownership.md) explains where shared chart state lives and how URL state is restored across navigation.
- [Blog](./blog.md) covers MDX content, frontmatter and scheduled publishing, captions, heading IDs, and math.
- [CollectiveX](./collectivex.md) covers the lazy ingest-on-read pipeline, its separate Neon database, tombstoned deletes, and the shared reader.
- [Chinese Pages (/zh)](./i18n.md) explains why /zh pages are hand-authored and how hreflang and blog translation pairing work.
- [Chinese Copy Editorial Guide](./chinese-copy.md) covers audience, register, terminology, the review workflow, and the PR checklist for Chinese copy.

- [Agentic Workload Explorer](./agentic-workload-explorer.md) covers the feature-gated explorer over a frozen, anonymized ProxyTrace snapshot and its separate read replica.
- [OperatorX](./operatorx.md) covers the hidden GEMM and routed MoE explorer, artifact persistence, deployment, and local verification.
