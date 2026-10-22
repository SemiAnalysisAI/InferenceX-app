# InferenceX MCP Server

Local MCP (Model Context Protocol) server for querying the InferenceX benchmark database via stdio transport.

## Setup

```bash
bun run mcp
```

The server requires `DATABASE_READONLY_URL`.

Or add to Claude Code:

```bash
claude mcp add --transport stdio inferencex -- bun run mcp
```
