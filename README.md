# InferenceX Dashboard / InferenceX 仪表板

<div align="center">

**English** | [中文](./README_zh.md)

</div>

A [Next.js](https://nextjs.org) dashboard for visualizing ML inference benchmark data. DB-backed with Neon PostgreSQL, React Query for data fetching, D3.js for interactive charts.

**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · D3.js · Neon PostgreSQL · Vercel · Cypress

## Overview

LLM inference performance is a major concern of providing AI services, but accurate performance analysis remains elusive. Fast cadence of software development and model releases makes comparing performance between setups difficult. Existing performance benchmarks quickly become obsolete due to being static, and participants game the benchmarks with unrealistic, highly specific configurations. InferenceX tackles these issues by benchmarking popular models on major hardware platforms nightly with the latest software. For each model and hardware combination, InferenceX sweeps through different tensor parallel sizes and max concurrent requests, showing the throughput vs. latency graph for the full picture. In terms of software configurations, we ensure they are generally applicable across different serving scenarios, and we open source the repo to welcome community contributions. We hope InferenceX informs the community up-to-date and realistic LLM inference performance.

## Architecture

```
Neon PostgreSQL → API routes (/api/v1/*) → React Query hooks → Context providers → D3.js charts
```

The frontend fetches data from API routes backed by a Neon PostgreSQL read replica. All presentation logic lives in the frontend — API routes return raw DB data.

### Monorepo Structure

```
packages/
├── app/          # Next.js frontend
├── constants/    # Shared constants (GPU keys, model mappings)
└── db/           # DB layer, ETL, migrations, queries, ingest scripts
```

## Prerequisites

- **Node.js**: 24.x
- **Bun**: 1.3.14+

Install Bun on macOS or Linux:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install Bun on Windows PowerShell:

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

## Getting Started

feel free to file an github issue if u need help setting up the dashboard

### 1. Clone & Install

```bash
git clone https://github.com/SemiAnalysisAI/InferenceX-app.git
cd InferenceX-app
bun install
```

### 2. Set Up a Database

The dashboard requires a live PostgreSQL database. Set `DATABASE_READONLY_URL` in `.env`; the application supports both standard PostgreSQL servers and Neon.

#### Option A: Standard PostgreSQL

Use the `postgres` driver for a local or remotely hosted PostgreSQL server:

```bash
cp .env.example .env
cat >> .env <<'EOF'
DATABASE_READONLY_URL=postgresql://postgres:postgres@localhost:5432/postgres
DATABASE_DRIVER=postgres
DATABASE_SSL=false
EOF
```

Remote PostgreSQL servers use TLS by default. Omit `DATABASE_SSL` unless the server explicitly requires it to be disabled.

#### Option B: Neon

Set `DATABASE_READONLY_URL` to a Neon PostgreSQL connection string. Neon hosts use the serverless HTTP driver automatically; `DATABASE_DRIVER=neon` can be set explicitly.

```bash
cp .env.example .env
cat >> .env <<'EOF'
DATABASE_READONLY_URL=postgresql://user:password@ep-example.us-east-1.aws.neon.tech/database
DATABASE_DRIVER=neon
DATABASE_SSL=true
EOF
```

### 3. Run the Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Development Scripts

These are the main scripts you'll use during development. Admin scripts for database and cache management are listed separately below.
Some of these may require additional setup or environment variables.

| Script                         | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `bun run dev`                  | Start development server with Turbopack        |
| `bun run build`                | Production build                               |
| `bun run start`                | Start production server                        |
| `bun run preview`              | Build then start production server locally     |
| `bun run typecheck`            | TypeScript type checking (all packages)        |
| `bun run lint`                 | Lint with oxlint                               |
| `bun run lint:fix`             | Auto-fix lint issues                           |
| `bun run fmt`                  | Format check with oxfmt                        |
| `bun run fmt:fix`              | Auto-fix formatting                            |
| `bun run security`             | Security audit                                 |
| `bun run test`                 | Run all tests (unit + E2E)                     |
| `bun run test:unit`            | Vitest unit tests                              |
| `bun run test:unit:coverage`   | Vitest unit tests with coverage                |
| `bun run test:e2e`             | Curated local Cypress smoke suite              |
| `bun run test:e2e:full`        | Complete Cypress component + integration suite |
| `bun run test:e2e:component`   | Complete Cypress component suite only          |
| `bun run test:e2e:integration` | Complete Cypress integration suite only        |
| `bun run clean`                | Remove build artifacts                         |
| `bun run clean:all`            | Remove build artifacts + node_modules          |

This repository uses Vitest and Cypress. Use the `bun run test:*` scripts above; `bun test` invokes Bun's separate built-in test runner and is not supported.

### Admin Scripts

These are meant to be used for database and cache management and maintenance tasks, and should not be necessary during regular development.
However, using `bun run admin:cache:invalidate` pointed at your local development server can be useful to test after making changes to the database or API routes.

Changes to `packages/db/src/etl/run-overrides.ts` that reach `main` or `master` are applied to the production database automatically by CI, followed by database verification, cache invalidation, and cache warmup. The override command remains available for local previews and manual recovery.

| Script                                 | Description                              |
| -------------------------------------- | ---------------------------------------- |
| `bun run admin:db:migrate`             | Run database migrations                  |
| `bun run admin:db:ingest:run`          | Ingest benchmark data from GitHub runs   |
| `bun run admin:db:ingest:ci`           | Ingest benchmark data (CI mode)          |
| `bun run admin:db:ingest:gcs`          | Ingest benchmark data from GCS           |
| `bun run admin:db:ingest:supplemental` | Ingest supplemental data                 |
| `bun run admin:db:apply-overrides`     | Preview or apply data overrides manually |
| `bun run admin:db:reset`               | Reset the database                       |
| `bun run admin:db:verify`              | Verify database integrity                |
| `bun run admin:cache:invalidate`       | Invalidate API cache                     |
| `bun run admin:cache:warmup`           | Warm up API cache                        |

## Deployment

Deployed on Vercel. See [`.env.example`](.env.example) for all required environment variables.
