# InferenceX MCP Server

MCP (Model Context Protocol) server for querying the InferenceX benchmark database. Deployable as a standalone Vercel serverless function.

## Deploy to Vercel

1. Create a new Vercel project from this monorepo
2. Set **Root Directory** to `packages/mcp`
3. Add environment variables:
   - `DATABASE_READONLY_URL` — Neon read-only connection string
   - `MCP_SECRET` — Bearer token for authentication (optional for local dev)

## Local Development

```bash
pnpm dev:mcp
```

Starts the server on `http://localhost:3001/api/mcp`.

## Connect from Claude Code

Add to your `.claude/settings.json` or project settings:

```json
{
  "mcpServers": {
    "inferencex": {
      "url": "https://<your-deployment>.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_SECRET>"
      }
    }
  }
}
```

For local development, omit the `headers` (auth is skipped when `MCP_SECRET` is not set).

## Tools

| Tool                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `get_overview`          | Full schema docs, column names, enums, metric keys       |
| `list_hardware`         | All GPU hardware types                                   |
| `list_models`           | All models                                               |
| `list_configs`          | Config combos (filterable by hardware/model)             |
| `get_latest_benchmarks` | Primary query tool — filters, sorting, metric extraction |
| `query_sql`             | Raw read-only SQL for aggregations and custom joins      |
