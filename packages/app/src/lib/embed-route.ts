/**
 * Embeddable chart routes (`/embed/model/[slug]` and `/zh/embed/model/[slug]`).
 *
 * These render a single InferenceX chart without the site chrome so a third
 * party page — the vLLM recipes site is the first consumer — can drop it into
 * an `<iframe>`. `proxy.ts` relaxes `frame-ancestors` for the same prefix; the
 * pathname test here is what the header, footer, and decorations use to stay
 * out of the frame.
 *
 * Kept dependency-free because `proxy.ts` imports it into the edge bundle.
 */
export const EMBED_PATH_PREFIX = '/embed/';

export function isEmbedPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith(EMBED_PATH_PREFIX) || pathname.startsWith(`/zh${EMBED_PATH_PREFIX}`);
}

/** Request header the proxy uses to hand the raw `?theme=` value to the embed layout. */
export const EMBED_THEME_HEADER = 'x-inferencex-embed-theme';
/** Request header the proxy uses to hand the raw `?skin=` value to the embed layout. */
export const EMBED_SKIN_HEADER = 'x-inferencex-embed-skin';
