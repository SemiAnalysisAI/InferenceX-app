// Layered walkable grid. Floor and clearance probes come from the imported mesh.
export class Navigation {
  constructor(cell = 0.85) {
    this.cell = cell;
    this.nodes = [];
    this.columns = new Map();
  }
  add(ix, iz, y) {
    const n = { id: this.nodes.length, x: ix * this.cell, y, z: iz * this.cell, ix, iz, edges: [] };
    this.nodes.push(n);
    const key = `${ix},${iz}`;
    if (!this.columns.has(key)) this.columns.set(key, []);
    this.columns.get(key).push(n);
    return n;
  }
  connect(clear) {
    for (const n of this.nodes)
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        for (const b of this.columns.get(`${n.ix + dx},${n.iz + dz}`) || []) {
          if (Math.abs(n.y - b.y) > 0.48) continue;
          if (clear(n, b)) n.edges.push(b.id);
        }
      }
  }
  nearest(p, max = 12) {
    let best = null,
      d = max * max;
    for (const n of this.nodes) {
      const v = (p.x - n.x) ** 2 + (p.z - n.z) ** 2 + 4 * (p.y - n.y) ** 2;
      if (v < d) {
        d = v;
        best = n;
      }
    }
    return best;
  }
  path(from, to) {
    const start = this.nearest(from),
      goal = this.nearest(to);
    if (!start || !goal) return [];
    const open = [start.id],
      visited = new Set(),
      g = new Map([[start.id, 0]]),
      came = new Map();
    const h = (id) => Math.hypot(this.nodes[id].x - goal.x, this.nodes[id].z - goal.z);
    let steps = 0;
    while (open.length > 0 && steps++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++)
        if (g.get(open[i]) + h(open[i]) < g.get(open[bi]) + h(open[bi])) bi = i;
      const id = open.splice(bi, 1)[0];
      if (id === goal.id) {
        const path = [this.nodes[id]];
        let c = id;
        while (came.has(c)) {
          c = came.get(c);
          path.push(this.nodes[c]);
        }
        return path.toReversed();
      }
      visited.add(id);
      const n = this.nodes[id];
      for (const next of n.edges) {
        if (visited.has(next)) continue;
        const b = this.nodes[next],
          score = g.get(id) + Math.hypot(n.x - b.x, n.z - b.z, n.y - b.y);
        if (score < (g.get(next) ?? Infinity)) {
          g.set(next, score);
          came.set(next, id);
          if (!open.includes(next)) open.push(next);
        }
      }
    }
    return [];
  }
}
