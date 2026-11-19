export const THUMBNAIL_WIDTHS = { tile: 640, card: 1200 } as const;

export function optimizedThumbnailSrc(src: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}
