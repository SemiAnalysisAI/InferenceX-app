'use client';

const RELOAD_GATE_KEY = 'chunk_reload';

/**
 * Match webpack's `ChunkLoadError` brand AND the dynamic-import / Turbopack
 * variants that don't always normalize `.name`. Covers `Loading chunk N failed`,
 * `Failed to load chunk`, `Failed to fetch dynamically imported module`, and
 * the literal `ChunkLoadError` substring.
 */
const CHUNK_ERROR_RE =
  /Loading chunk |Failed to (load|fetch)(?: dynamically imported)? (?:module|chunk)|ChunkLoadError/iu;

let installed = false;

/**
 * Reload the tab once when a Next.js chunk fails to load — typically after
 * a Vercel deploy rotates chunk hashes and a returning user still holds the
 * stale client. sessionStorage gates the reload to ONCE PER TAB SESSION so
 * a persistent CDN failure cannot trigger an infinite reload loop.
 *
 * Next.js does not export the ChunkLoadError class; discriminate by `.name`
 * with a fallback message regex for runtimes that don't normalize `.name`.
 * Do NOT refactor `.name` to `instanceof`.
 *
 * Idempotent: safe to call multiple times (React StrictMode, HMR, etc.) —
 * subsequent calls are a no-op so listeners never duplicate.
 */
export function installChunkLoadRecovery(): void {
  if (typeof window === 'undefined') return;
  if (installed) return;
  installed = true;

  function isChunkError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if (err.name === 'ChunkLoadError') return true;
    return CHUNK_ERROR_RE.test(err.message);
  }

  function maybeReload(err: unknown, fallbackMessage?: string): void {
    const matches =
      isChunkError(err) ||
      (err === null && typeof fallbackMessage === 'string' && CHUNK_ERROR_RE.test(fallbackMessage));
    if (!matches) return;
    if (sessionStorage.getItem(RELOAD_GATE_KEY) === '1') return;
    sessionStorage.setItem(RELOAD_GATE_KEY, '1');
    window.location.reload();
  }

  window.addEventListener('error', (e) => maybeReload(e.error, e.message));
  window.addEventListener('unhandledrejection', (e) => maybeReload(e.reason));
}
