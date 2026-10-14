---
name: neon
description: >-
  Repository-specific guidance for working with InferenceX's Neon PostgreSQL
  databases, connection variables, migrations, and query code. Use when Neon,
  Postgres, DATABASE_URL, database, schema, migration, or backend data access is
  mentioned.
---

# Neon PostgreSQL in InferenceX

Use this skill for database work in this repository. InferenceX runs on Vercel
and uses Neon as PostgreSQL; do not introduce Neon Auth, Object Storage,
Functions, AI Gateway, an ORM, or new infrastructure unless the user asks.

## Start with the repository

Read the relevant local documentation before changing code:

- `docs/index.md`
- `docs/architecture.md` for the API and cache boundaries
- `docs/data-pipeline.md` for ingestion and schema flow
- `docs/operatorx.md` for the separate OperatorX database

Existing database code lives in `packages/db/`. Reuse its connection helpers,
tagged SQL patterns, migrations, and scripts instead of creating a parallel
client or configuration layer.

## Connections and credentials

- Main read path: `DATABASE_READONLY_URL`
- Main administrative writes: `DATABASE_WRITE_URL`
- OperatorX read path: `DATABASE_OPERATORX_READONLY_URL`
- OperatorX writes and migrations: `DATABASE_OPERATORX_WRITE_URL`

CollectiveX has no database: it serves a build-time snapshot of committed result
files (`docs/collectivex.md`).

Keep credentials in environment variables. Never print, commit, copy into
source, or expose connection strings in logs or responses. Use the read-only
connection for diagnostics and normal reads; use a write connection only when
the requested task authorizes mutation.

The application uses `@neondatabase/serverless` for serverless reads and
`postgres` for administrative or transaction-heavy scripts. Preserve that
split unless runtime requirements clearly demand a change.

## Schema and query changes

1. Inspect the current migration and query code before proposing a schema
   change.
2. Add an append-only migration; never rewrite a migration that may have
   already run.
3. Keep raw database rows in API responses unless a documented route is an
   explicit exception.
4. Make multi-step writes atomic and safe under concurrent Vercel requests.
5. Verify indexes and bounded query behavior for new filters or ordering.
6. Add focused query/migration tests and run the repository checks.

Useful commands:

```bash
bun run admin:db:migrate
bun run admin:db:migrate:operatorx
bun run admin:db:verify
bun run typecheck
bun run test:unit
```

Do not run migrations, destructive SQL, or production writes during a review
or diagnostic request. For authorized schema work, prefer an isolated Neon
branch and confirm the target before applying changes.

## Current Neon documentation

Neon changes over time. For platform-specific behavior, verify against the
official documentation index rather than relying on this compact skill:

- https://neon.com/docs/llms.txt
- https://neon.com/docs/connect/choose-connection
- https://neon.com/docs/serverless/serverless-driver
- https://neon.com/docs/introduction/branching
