// Four non-dominated MI355X FP4 1K/1K points in cypress/fixtures/api/benchmarks.json:
// (median interactivity, output throughput/GPU), rounded only for a small course seed.
const fixture = [
  [68.2, 422.89],
  [86.24, 344.55],
  [88.83, 172.46],
  [103.65, 98.99],
];
function normalize(p: { x: number; y: number }[]) {
  const lo = p[0].x,
    hi = p.at(-1)!.x,
    base = p[0].y,
    end = p.at(-1)!.y;
  if (hi - lo < 1 || Math.abs(end - base) < 1) return null;
  return Array.from({ length: 25 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / 24;
    let k = p.findIndex((v) => v.x >= x);
    if (k < 1) k = 1;
    const a = p[k - 1],
      b = p[k],
      u = (x - a.x) / Math.max(0.001, b.x - a.x);
    return Math.min(1, Math.max(0, (a.y + (b.y - a.y) * u - base) / (end - base)));
  });
}
export function courseSeed() {
  let best: { x: number; y: number }[] | null = null,
    drop = 0;
  for (const path of document.querySelectorAll<SVGPathElement>('path.roofline-path')) {
    if (!path.isConnected || getComputedStyle(path).display === 'none') continue;
    const length = path.getTotalLength();
    if (length < 50) continue;
    const p = Array.from({ length: 30 }, (_, i) => path.getPointAtLength((length * i) / 29)).sort(
      (a, b) => a.x - b.x,
    );
    if (p.at(-1)!.y - p[0].y > drop) {
      drop = p.at(-1)!.y - p[0].y;
      best = p;
    }
  }
  return (best && normalize(best)) || normalize(fixture.map(([x, y]) => ({ x, y })));
}
