# InferenceX Dashboard

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
- **pnpm**: 10+

Install pnpm via Corepack (bundled with Node.js):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## Getting Started

feel free to file an github issue if u need help setting up the dashboard

### 1. Clone & Install

```bash
git clone https://github.com/SemiAnalysisAI/InferenceX-app.git
cd InferenceX-app
pnpm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

See [`.env.example`](.env.example) for all variables and descriptions.

### 3. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Development Scripts

These are the main scripts you'll use during development. Admin scripts for database and cache management are listed separately below.
Some of these may require additional setup or environment variables.

| Script                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `pnpm dev`                  | Start development server with Turbopack    |
| `pnpm build`                | Production build                           |
| `pnpm start`                | Start production server                    |
| `pnpm preview`              | Build then start production server locally |
| `pnpm typecheck`            | TypeScript type checking (all packages)    |
| `pnpm lint`                 | Lint with oxlint                           |
| `pnpm lint:fix`             | Auto-fix lint issues                       |
| `pnpm fmt`                  | Format check with oxfmt                    |
| `pnpm fmt:fix`              | Auto-fix formatting                        |
| `pnpm security`             | Security audit (pnpm audit + audit-ci)     |
| `pnpm test`                 | Run all tests (unit + E2E)                 |
| `pnpm test:unit`            | Vitest unit tests                          |
| `pnpm test:unit:coverage`   | Vitest unit tests with coverage            |
| `pnpm test:e2e`             | Cypress E2E tests                          |
| `pnpm test:e2e:component`   | Cypress component tests only               |
| `pnpm test:e2e:integration` | Cypress integration tests only             |
| `pnpm clean`                | Remove build artifacts                     |
| `pnpm clean:all`            | Remove build artifacts + node_modules      |

### Admin Scripts

These are meant to be used for database and cache management and maintenance tasks, and should not be necessary during regular development.
However, using `pnpm admin:cache:invalidate` pointed at your local development server can be useful to test after making changes to the database or API routes.

| Script                              | Description                            |
| ----------------------------------- | -------------------------------------- |
| `pnpm admin:db:migrate`             | Run database migrations                |
| `pnpm admin:db:ingest:run`          | Ingest benchmark data from GitHub runs |
| `pnpm admin:db:ingest:ci`           | Ingest benchmark data (CI mode)        |
| `pnpm admin:db:ingest:gcs`          | Ingest benchmark data from GCS         |
| `pnpm admin:db:ingest:supplemental` | Ingest supplemental data               |
| `pnpm admin:db:apply-overrides`     | Apply data overrides                   |
| `pnpm admin:db:reset`               | Reset the database                     |
| `pnpm admin:db:verify`              | Verify database integrity              |
| `pnpm admin:cache:invalidate`       | Invalidate API cache                   |
| `pnpm admin:cache:warmup`           | Warm up API cache                      |

## Deployment

Deployed on Vercel. See [`.env.example`](.env.example) for all required environment variables.
