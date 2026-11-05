'use client';

const RELOAD_GATE_KEY = 'chunk_reload';

const CHUNK_ERROR_RE =
  /Loading chunk |Failed to (?:load|fetch)(?: dynamically imported)? (?:module|chunk)|ChunkLoadError/iu;

let installed = false;

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
