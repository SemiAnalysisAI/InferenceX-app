import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '@semianalysisai/inferencex-mcp/server';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 250;

/** Simple in-memory IP rate limiter. Resets on cold start. */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/html') || !request.headers.get('content-type')) {
    const url = new URL('/api/mcp', request.url);
    return Response.json(
      {
        error: 'This is an MCP (Model Context Protocol) endpoint, not a REST API.',
        setup: {
          description:
            'Add this to your Claude Code settings (.claude/settings.json) or MCP client config:',
          mcpServers: {
            inferencex: { url: url.href },
          },
        },
      },
      { status: 400 },
    );
  }
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
