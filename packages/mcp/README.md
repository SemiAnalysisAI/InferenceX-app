# InferenceX MCP Server

Local MCP (Model Context Protocol) server for querying the InferenceX benchmark database via stdio transport.

## Setup

```bash
bun run mcp
```

The server requires `DATABASE_READONLY_URL` and deliberately uses the postgres.js TCP
driver. URL and TLS handling come from the shared database resolver. `DATABASE_SSL=false`
overrides TLS for any host; loopback hosts disable TLS by default.

Or add to Claude Code:

```bash
claude mcp add --transport stdio inferencex -- bun run mcp
```

## Tools

| Tool                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `get_overview`          | Full schema docs, column names, enums, metric keys       |
| `list_hardware`         | All GPU hardware types                                   |
| `list_models`           | All models                                               |
| `list_configs`          | Config combos (filterable by hardware/model)             |
| `get_latest_benchmarks` | Primary query tool — filters, sorting, metric extraction |
| `query_sql`             | Raw read-only SQL for aggregations and custom joins      |
