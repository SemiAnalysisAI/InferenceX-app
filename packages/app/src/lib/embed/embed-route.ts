export const EMBED_PATH_PREFIX = '/embed/';

export function isEmbedPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith(EMBED_PATH_PREFIX) || pathname.startsWith(`/zh${EMBED_PATH_PREFIX}`);
}

export const EMBED_THEME_HEADER = 'x-inferencex-embed-theme';
export const EMBED_SKIN_HEADER = 'x-inferencex-embed-skin';
