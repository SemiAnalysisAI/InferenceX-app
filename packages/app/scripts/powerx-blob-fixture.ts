import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Local HTTP transport for the real Blob SDK; never contacts a Blob store. */
export async function startPowerxBlobFixture(port = 0) {
  const objects = new Map<string, string>();
  const counts = { reads: 0, writes: 0, failedWrites: 0 };
  let rejectWrites = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const pathname = url.searchParams.get('pathname') ?? url.searchParams.get('url');
    response.setHeader('content-type', 'application/json');
    const fail = (status: number, code: string) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: { code, message: code } }));
    };
    if (url.pathname === '/body') {
      counts.reads++;
      const body = objects.get(pathname!);
      if (body === undefined) return fail(404, 'not_found');
      response.end(body);
      return;
    }
    if (!pathname) return fail(400, 'bad_request');
    if (request.method === 'PUT') {
      counts.writes++;
      if (rejectWrites) {
        counts.failedWrites++;
        request.resume();
        return fail(403, 'forbidden');
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      objects.set(pathname, Buffer.concat(chunks).toString());
    }
    if (!objects.has(pathname)) return fail(404, 'not_found');
    const address = server.address() as AddressInfo;
    const bodyUrl = `http://127.0.0.1:${address.port}/body?url=${encodeURIComponent(pathname)}`;
    response.end(
      JSON.stringify({
        url: bodyUrl,
        downloadUrl: bodyUrl,
        pathname,
        size: Buffer.byteLength(objects.get(pathname)!),
        contentType: 'application/json',
        uploadedAt: new Date().toISOString(),
        etag: 'local-fixture',
      }),
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    env: {
      VERCEL_BLOB_API_URL: `http://127.0.0.1:${address.port}`,
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_local_fixture',
      BLOB_CACHE_PREFIX: 'powerx-local-acceptance',
    },
    objects,
    counts,
    rejectWrites: (value: boolean) => {
      rejectWrites = value;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
            ? reject(error)
            : resolve(),
        );
      }),
  };
}
