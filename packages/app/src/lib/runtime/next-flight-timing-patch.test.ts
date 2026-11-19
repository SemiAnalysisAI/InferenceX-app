import { timeStamp } from 'node:console';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
interface FlightClient {
  createFromReadableStream: (stream: ReadableStream<Uint8Array>) => PromiseLike<unknown>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(['turbopack', 'webpack', 'turbopack-experimental', 'webpack-experimental'])(
  'patched Next %s Flight timing',
  (bundler) => {
    it.each([
      { aborted: false, startTime: 10, offset: -1000, span: null },
      { aborted: false, startTime: 20, offset: -20, span: { start: 0, end: 0 } },
      { aborted: false, startTime: 10, offset: -15, span: { start: 0, end: 5 } },
      { aborted: false, startTime: 10, offset: 0, span: { start: 10, end: 20 } },
      { aborted: true, startTime: 10, offset: -1000, span: null },
      { aborted: true, startTime: 10, offset: -10, span: { start: 0, end: 0 } },
      { aborted: true, startTime: 10, offset: 0, span: { start: 10, end: 10 } },
    ])(
      'retains the error and valid timing at offset $offset (aborted=$aborted)',
      async ({ aborted, startTime, offset, span }) => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        // Vitest's captured console omits this native capability required by React's timing gate.
        vi.stubGlobal('console', { ...console, timeStamp });
        if (bundler.startsWith('webpack')) {
          // The browser decoder wraps this at import; these Flight rows load no client modules.
          vi.stubGlobal('__webpack_require__', {
            u() {
              throw new Error('The Flight timing fixture must not load browser chunks');
            },
          });
        }
        const { createFromReadableStream } = require(
          `next/dist/compiled/react-server-dom-${bundler}/client.browser`,
        ) as FlightClient;
        const measure = vi.spyOn(performance, 'measure');
        const digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
        // Flight's N row translates server times to the document's performance.timeOrigin.
        const rows = `${[
          `:N${performance.timeOrigin + offset}`,
          `0:D${JSON.stringify({ time: startTime })}`,
          '0:D{"name":"UnknownChineseRoute","env":"Server","key":null,"props":{}}',
          ...(aborted
            ? []
            : [
                '0:D{"time":20}',
                `0:E${JSON.stringify({ name: 'Error', message: digest, digest, stack: [], env: 'Server' })}`,
              ]),
        ].join('\n')}\n`;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rows));
            controller.close();
          },
        });

        await expect(Promise.resolve(createFromReadableStream(stream))).rejects.toMatchObject(
          aborted ? { message: 'Connection closed.' } : { message: digest, digest },
        );
        expect(() => vi.runOnlyPendingTimers()).not.toThrow();

        if (span) {
          expect(measure).toHaveBeenCalledExactlyOnceWith(
            '\u200BUnknownChineseRoute',
            expect.objectContaining(span),
          );
        } else {
          expect(measure).not.toHaveBeenCalled();
        }
      },
    );
  },
);
