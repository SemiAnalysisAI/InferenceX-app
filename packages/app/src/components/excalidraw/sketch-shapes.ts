// Hand-drawn shapes pre-generated with rough.js (MIT) so the theme ships no runtime
// dependency. Each entry is a list of SVG paths: fill (hachure) first, then outline.

export interface SketchPath {
  d: string;
  stroke: string;
  strokeWidth: number;
}

export const bannerRect: SketchPath[] = [
  {
    d: 'M0.8 1.1 C48.4 0.4, 95 -0.2, 239.4 3 M2 2.7 C63.7 3.8, 126.9 4, 238.2 2.2 M238.6 0.8 C237.6 14.8, 239.7 27.3, 238.2 55.4 M238.9 1.6 C239.2 12.1, 238.3 23.4, 237.2 53.1 M237.3 53.5 C178.9 55.4, 120.5 57.4, 3.3 53 M237.3 53.6 C160.4 55.3, 83.6 54.7, 2.7 54.1 M3.8 53.2 C1.7 39.9, 0.5 27.5, 3.8 2.4 M2.7 55 C1.8 38.9, 1.3 23, 1.3 3',
    stroke: '#1e1e1e',
    strokeWidth: 1.5,
  },
];

export const bannerUnderline: SketchPath[] = [
  {
    d: 'M63.7 46.7 C86.7 44.3, 106.2 45.8, 172.9 43.5 M64.2 46.4 C106.3 44.7, 149.5 44.8, 172.8 44.8',
    stroke: '#6965db',
    strokeWidth: 2,
  },
];
