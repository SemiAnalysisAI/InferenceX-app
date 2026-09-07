// Count decompressed bytes from fetch's stream; Content-Length may describe compressed data.
import { responseError } from './cli-contract.mjs';

export function createResponseBudget({
  responseBytes,
  totalBytes,
  timeoutMs,
  signal: cancellation,
}) {
  const signal = cancellation
    ? AbortSignal.any([AbortSignal.timeout(timeoutMs), cancellation])
    : AbortSignal.timeout(timeoutMs);
  let total = 0;
  return {
    signal,
    get consumedBytes() {
      return total;
    },
    async read(response, { signal: readSignal = signal } = {}) {
      readSignal.throwIfAborted();
      if (!response.body) return Buffer.alloc(0);
      const reader = response.body.getReader();
      // Cancel settles a pending reader.read(); check the signal before treating done as success.
      const abort = () => {
        void reader.cancel(readSignal.reason).catch(() => {});
      };
      readSignal.addEventListener('abort', abort, { once: true });
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          readSignal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          total += value.byteLength;
          if (size > responseBytes || total > totalBytes) {
            const message =
              size > responseBytes
                ? `Response exceeds ${responseBytes}-byte budget`
                : `Operation exceeds total ${totalBytes}-byte budget`;
            void reader.cancel(message).catch(() => {});
            throw responseError(message);
          }
          chunks.push(value);
        }
        return Buffer.concat(chunks, size);
      } finally {
        readSignal.removeEventListener('abort', abort);
        reader.releaseLock();
      }
    },
  };
}
