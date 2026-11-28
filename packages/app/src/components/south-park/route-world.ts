export const lanePapers = ['#eaf1dc', '#fbecd5', '#deeeec', '#ebe5ed', '#e3e2ed'];
const stops = ['bus-stop', 'main-street', 'pond', 'elementary', 'casa'];
// A location plate, cropped rather than vertically squeezed. The game lanes stay fixed.
export function paintHorizon(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  zone: number,
  travel: number,
  reduce: boolean,
  images: Map<string, HTMLImageElement>,
) {
  c.save();
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  const off = reduce ? 0 : Math.max(0, Math.min(w, (w * travel) / 0.85));
  function plate(index: number, x: number) {
    c.fillStyle = lanePapers[index];
    c.fillRect(x, 0, w, h);
    const im = images.get(stops[index]);
    if (!im?.complete || !im.naturalWidth) return;
    const sh = Math.min(im.naturalHeight, (im.naturalWidth * h) / w),
      sy = (im.naturalHeight - sh) * [0.5, 0.54, 0.66, 0.58, 0.5][index];
    c.drawImage(im, 0, sy, im.naturalWidth, sh, x, 0, w, h);
  }
  if (zone > 0 && off > 0) plate(zone - 1, off - w);
  plate(zone, off);
  c.restore();
}
