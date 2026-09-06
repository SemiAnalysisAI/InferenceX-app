// Count decompressed bytes from fetch's stream; Content-Length may describe compressed data.
const PACKAGE_VERSION = '0.9.0';
export { PACKAGE_VERSION };

export function createResponseBudget({ responseBytes, totalBytes, timeoutMs }) {
  const signal = AbortSignal.timeout(timeoutMs);
  let total = 0;
  return {
    signal,
    async read(response) {
      signal.throwIfAborted();
      if (!response.body) return Buffer.alloc(0);
      const reader = response.body.getReader();
      // Cancel settles a pending reader.read(); check the signal before treating done as success.
      const abort = () => {
        void reader.cancel(signal.reason).catch(() => {});
      };
      signal.addEventListener('abort', abort, { once: true });
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          total += value.byteLength;
          if (size > responseBytes || total > totalBytes) {
            const message =
              size > responseBytes
                ? `Response exceeds ${responseBytes}-byte budget`
                : `Operation exceeds total ${totalBytes}-byte budget`;
            void reader.cancel(message).catch(() => {});
            throw new Error(message);
          }
          chunks.push(value);
        }
        return Buffer.concat(chunks, size);
      } finally {
        signal.removeEventListener('abort', abort);
        reader.releaseLock();
      }
    },
  };
}
