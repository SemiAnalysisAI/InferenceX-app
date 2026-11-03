export class PointHitGrid {
  private columns = 0;
  private rows = 0;
  private cellStart = new Int32Array(1);
  private items = new Int32Array(0);
  private width = 0;
  private height = 0;
  private xs: Float64Array = new Float64Array(0);
  private ys: Float64Array = new Float64Array(0);

  private readonly radius: number;

  constructor(radius: number) {
    this.radius = radius;
  }

  build(
    xs: Float64Array,
    ys: Float64Array,
    interactive: Uint8Array,
    count: number,
    width: number,
    height: number,
  ): void {
    const radius = this.radius;
    this.xs = xs;
    this.ys = ys;
    this.width = width;
    this.height = height;
    this.columns = Math.max(1, Math.ceil((width + 2 * radius) / radius));
    this.rows = Math.max(1, Math.ceil((height + 2 * radius) / radius));
    const cellCount = this.columns * this.rows;
    const cellStart = new Int32Array(cellCount + 1);
    const cells = new Int32Array(count).fill(-1);
    for (let index = 0; index < count; index++) {
      if (!interactive[index]) continue;
      const cell = this.cellOf(xs[index], ys[index]);
      if (cell < 0) continue;
      cells[index] = cell;
      cellStart[cell + 1]++;
    }
    for (let cell = 0; cell < cellCount; cell++) cellStart[cell + 1] += cellStart[cell];
    const fill = cellStart.slice(0, cellCount);
    const items = new Int32Array(cellStart[cellCount]);
    for (let index = 0; index < count; index++) {
      const cell = cells[index];
      if (cell >= 0) items[fill[cell]++] = index;
    }
    this.cellStart = cellStart;
    this.items = items;
  }

  private cellOf(x: number, y: number): number {
    const radius = this.radius;
    if (!(x >= -radius && x <= this.width + radius && y >= -radius && y <= this.height + radius)) {
      return -1;
    }
    const column = Math.min(this.columns - 1, Math.floor((x + radius) / radius));
    const row = Math.min(this.rows - 1, Math.floor((y + radius) / radius));
    return row * this.columns + column;
  }

  hit(x: number, y: number): number {
    if (!(x >= 0 && x <= this.width && y >= 0 && y <= this.height)) return -1;
    const radius = this.radius;
    const limit = radius * radius;
    const firstColumn = Math.max(0, Math.floor(x / radius));
    const lastColumn = Math.min(this.columns - 1, Math.floor((x + 2 * radius) / radius));
    const firstRow = Math.max(0, Math.floor(y / radius));
    const lastRow = Math.min(this.rows - 1, Math.floor((y + 2 * radius) / radius));
    let best = -1;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const cell = row * this.columns + column;
        for (let item = this.cellStart[cell]; item < this.cellStart[cell + 1]; item++) {
          const index = this.items[item];
          if (index <= best) continue;
          const dx = this.xs[index] - x;
          const dy = this.ys[index] - y;
          if (dx * dx + dy * dy <= limit) best = index;
        }
      }
    }
    return best;
  }
}

export function hitAreaPath(
  xs: Float64Array,
  ys: Float64Array,
  interactive: Uint8Array,
  count: number,
  width: number,
  height: number,
  radius: number,
): string {
  const parts: string[] = [];
  const arc = `a${radius},${radius} 0 1,0 ${2 * radius},0a${radius},${radius} 0 1,0 ${-2 * radius},0`;
  for (let index = 0; index < count; index++) {
    if (!interactive[index]) continue;
    const x = xs[index];
    const y = ys[index];
    if (!(x >= -radius && x <= width + radius && y >= -radius && y <= height + radius)) continue;
    parts.push(`M${Math.round((x - radius) * 10) / 10},${Math.round(y * 10) / 10}${arc}`);
  }
  return parts.join('');
}
