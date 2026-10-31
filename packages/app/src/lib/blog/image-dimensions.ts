export interface ImageDimensions {
  width: number;
  height: number;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCodePoint(...bytes.subarray(start, start + length));

function webpDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const read24 = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return { width: view.getUint16(26, true) & 16_383, height: view.getUint16(28, true) & 16_383 };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 16_383) + 1, height: ((bits >> 14) & 16_383) + 1 };
  }
  return null;
}

// Start-of-frame markers carry the frame size; DHT (196), JPG (200) and DAC (204) share the range.
const isStartOfFrame = (marker: number) =>
  marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204;

function jpegDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 255) return null;
    const marker = bytes[offset + 1];
    if (marker === 255) {
      offset += 1;
      continue;
    }
    if (isStartOfFrame(marker)) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/**
 * Pixel size from the header of a PNG, JPEG, GIF or WebP file, or null when the bytes are not one
 * of those formats or end before the size field. Callers may pass only the first bytes of a file.
 */
export function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dimensions: ImageDimensions | null = null;
  if (bytes.length >= 24 && ascii(bytes, 1, 3) === 'PNG' && ascii(bytes, 12, 4) === 'IHDR') {
    dimensions = { width: view.getUint32(16), height: view.getUint32(20) };
  } else if (ascii(bytes, 0, 4) === 'GIF8') {
    dimensions = { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  } else if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    dimensions = webpDimensions(bytes, view);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    dimensions = jpegDimensions(bytes, view);
  }
  return dimensions && dimensions.width > 0 && dimensions.height > 0 ? dimensions : null;
}
