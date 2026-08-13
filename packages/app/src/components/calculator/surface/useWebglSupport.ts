'use client';

import { useEffect, useState } from 'react';

/**
 * Whether this browser can give us a WebGL context — probed *before* anything
 * mounts a canvas.
 *
 * Probing first rather than catching a failure later is what keeps the surface from
 * breaking the page it sits on: with no context there is no `<Canvas>`, no render
 * loop and nothing to time out. That is also the path CI takes, since the test
 * runners have no GPU and headless Firefox routinely refuses a context outright.
 */

let cached: boolean | undefined;

export function detectWebgl(): boolean {
  if (cached !== undefined) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      cached = false;
      return cached;
    }
    // Hand the context straight back. Browsers cap live contexts (~16) and this
    // page can already be holding one for the animated background, so a probe that
    // keeps its context can be the thing that starves the real chart.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** Test seam: lets a spec force the fallback path deterministically. */
export function resetWebglProbe(): void {
  cached = undefined;
}

export type WebglSupport = 'probing' | 'ok' | 'unavailable';

export function useWebglSupport(): WebglSupport {
  const [support, setSupport] = useState<WebglSupport>('probing');
  // Probed in an effect, not in a state initialiser, so the first client render is
  // deterministic and the probe never runs during SSR.
  useEffect(() => setSupport(detectWebgl() ? 'ok' : 'unavailable'), []);
  return support;
}
