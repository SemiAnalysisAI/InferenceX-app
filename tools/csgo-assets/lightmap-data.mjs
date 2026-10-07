export function decodeRgbExp(bytes, output, convert = (value) => value) {
  if (bytes.length % 4 || output.length !== bytes.length) throw new Error('Invalid RGBExp buffer');
  for (let i = 0; i < bytes.length; i += 4) {
    const exponent = bytes[i + 3] > 127 ? bytes[i + 3] - 256 : bytes[i + 3];
    const scale = 2 ** exponent / 255;
    for (let channel = 0; channel < 3; channel++) {
      output[i + channel] = convert(Math.min(65504, bytes[i + channel] * scale));
    }
    output[i + 3] = convert(1);
  }
  return output;
}
