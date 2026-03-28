import { createServer as createHttpServer } from 'node:http';
import handler from '../api/mcp.js';

const port = Number(process.env.PORT) || 3001;

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await new Promise<Buffer>((resolve) => {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        })
      : undefined;

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });

  const response = await handler(request);

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const buffer = await response.arrayBuffer();
  res.end(Buffer.from(buffer));
});

server.listen(port, () => {
  console.log(`MCP server listening on http://localhost:${port}/api/mcp`);
});
