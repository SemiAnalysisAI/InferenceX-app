import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock server + transport so handler doesn't need a real DB ──────────
vi.mock('./server.js', () => ({
  createServer: () => ({
    connect: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    async handleRequest() {
      return new Response('ok', { status: 200 });
    }
    async close() {}
  },
}));

const { default: handler } = await import('../api/mcp.js');

function makeRequest(
  method: string,
  opts: { secret?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...opts.headers,
  };
  if (opts.secret) headers.authorization = `Bearer ${opts.secret}`;
  return new Request('http://localhost:3001/api/mcp', {
    method,
    headers,
    body:
      method !== 'GET'
        ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
        : undefined,
  });
}

describe('handler auth', () => {
  const SECRET = 'test-secret-123';

  beforeEach(() => {
    process.env.MCP_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.MCP_SECRET;
  });

  it('rejects requests without auth when MCP_SECRET is set', async () => {
    const res = await handler(makeRequest('POST'));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('rejects requests with wrong token', async () => {
    const res = await handler(makeRequest('POST', { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct token', async () => {
    const res = await handler(makeRequest('POST', { secret: SECRET }));
    expect(res.status).toBe(200);
  });

  it('allows requests when MCP_SECRET is not set', async () => {
    delete process.env.MCP_SECRET;
    const res = await handler(makeRequest('POST'));
    expect(res.status).toBe(200);
  });
});

describe('handler GET', () => {
  it('returns setup JSON for browser-like GET requests', async () => {
    const req = new Request('http://localhost:3001/api/mcp', {
      method: 'GET',
      headers: { accept: 'text/html' },
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; setup: { mcpServers: unknown } };
    expect(body.error).toContain('MCP');
    expect(body.setup.mcpServers).toBeDefined();
  });
});
