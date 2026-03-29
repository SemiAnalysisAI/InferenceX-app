# InferenceX MCP Server

Local MCP (Model Context Protocol) server for querying the InferenceX benchmark database via stdio transport.

## Setup

```bash
pnpm mcp
```

Or add to Claude Code:

```bash
claude mcp add --transport stdio inferencex -- pnpm mcp
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
