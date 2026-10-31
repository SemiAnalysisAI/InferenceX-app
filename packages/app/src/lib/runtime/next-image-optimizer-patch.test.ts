import { createRequire } from 'node:module';
import path from 'node:path';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';

// patches/next@16.3.3.patch: Next's optimizer reads a local source image through a mocked request
// that reused the browser's socket. If the browser cancelled the image (a navigation or a new
// srcset pick), `send` saw the dead socket and dropped the file stream, so the optimization never
// finished and every later request for that image width hung, holding the page `load` event.
const require = createRequire(import.meta.url);
const { fetchInternalImage } = require('next/dist/server/image-optimizer') as {
  fetchInternalImage: (
    href: string,
    req: { method: string; socket: Socket },
    res: unknown,
    maximumResponseBody: number,
    handleRequest: (req: unknown, res: unknown) => Promise<void>,
  ) => Promise<{ buffer: Buffer; contentType: string }>;
};
const { serveStatic } = require('next/dist/server/serve-static') as {
  serveStatic: (req: unknown, res: unknown, file: string) => Promise<void>;
};

const SOURCE_IMAGE = path.resolve(__dirname, '../../../public/favicon-32.webp');

describe('patched Next image optimizer', () => {
  // Unpatched, the fetch never settles, so the test fails at its timeout instead of resolving.
  it(
    'reads the source image after the browser has cancelled its request',
    { timeout: 2000 },
    async () => {
      const cancelledSocket = new Socket();
      cancelledSocket.destroy();

      const upstream = await fetchInternalImage(
        '/favicon-32.webp',
        { method: 'GET', socket: cancelledSocket },
        {},
        50_000_000,
        (req, res) => serveStatic(req, res, SOURCE_IMAGE),
      );

      expect(upstream.contentType).toBe('image/webp');
      expect(upstream.buffer.length).toBeGreaterThan(0);
    },
  );
});
