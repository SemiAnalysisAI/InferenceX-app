import { distance, ROAD, type Point, type World } from './gta-world';

interface Node extends Point {
  edges: Map<string, number>;
}
interface Segment {
  a: string;
  b: string;
  oneway: boolean;
}
const graphs = new WeakMap<World, Map<string, Node>>();
const segments = new WeakMap<World, Segment[]>();

function project(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
  );
  return { x: a.x + dx * t, z: a.z + dz * t };
}

function graphFor(world: World) {
  let graph = graphs.get(world);
  if (graph) return graph;
  graph = new Map();
  const lines: Segment[] = [];
  const freeway = new Set<string>();
  for (const road of world.roads) {
    if (road.cls > ROAD.service) continue;
    let previous = '';
    for (let i = 0; i < road.pts.length; i += 2) {
      const p = { x: road.pts[i], z: road.pts[i + 1] };
      const key = world.nodeKey(p.x, p.z);
      if (!graph.has(key)) graph.set(key, { ...p, edges: new Map() });
      if (road.name === 'US 101 South Bay Freeway') freeway.add(key);
      if (previous && previous !== key) {
        const a = graph.get(previous)!;
        const b = graph.get(key)!;
        const cost = distance(a, b);
        a.edges.set(key, cost);
        if (!road.oneway) b.edges.set(previous, cost);
        lines.push({ a: previous, b: key, oneway: road.oneway });
      }
      previous = key;
    }
  }
  // The deliberately compressed freeway overlaps streets without sharing OSM
  // vertices. Join only overlapping, unobstructed road surfaces (at most 15 m).
  for (const key of freeway) {
    const p = graph.get(key)!;
    for (const line of lines) {
      if (freeway.has(line.a) || freeway.has(line.b)) continue;
      const a = graph.get(line.a)!,
        b = graph.get(line.b)!;
      if (
        p.x < Math.min(a.x, b.x) - 15 ||
        p.x > Math.max(a.x, b.x) + 15 ||
        p.z < Math.min(a.z, b.z) - 15 ||
        p.z > Math.max(a.z, b.z) + 15
      )
        continue;
      const q = project(p, a, b);
      const gap = distance(p, q);
      if (gap > 15) continue;
      let clear = true;
      for (let t = 0; t <= 1; t += 0.2) {
        if (world.blocked({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, 1.15))
          clear = false;
      }
      if (!clear) continue;
      const id = `join:${key}:${line.a}:${line.b}`;
      const join: Node = {
        ...q,
        edges: new Map([
          [line.b, distance(q, b)],
          [key, gap],
        ]),
      };
      a.edges.set(id, distance(a, q));
      p.edges.set(id, gap);
      if (!line.oneway) {
        b.edges.set(id, distance(b, q));
        join.edges.set(line.a, distance(q, a));
      }
      graph.set(id, join);
    }
  }
  graphs.set(world, graph);
  segments.set(world, lines);
  return graph;
}

/** GPS uses all mapped drivable roads, not just the subset populated by traffic. */
export function streetRoute(world: World, from: Point, to: Point): Point[] {
  if (distance(from, to) < 18) return [];
  const graph = graphFor(world);
  const nearest = (p: Point) => {
    let snap: (Segment & { point: Point }) | null = null;
    let best = Infinity;
    for (const line of segments.get(world)!) {
      const point = project(p, graph.get(line.a)!, graph.get(line.b)!);
      const d = distance(point, p);
      if (d < best) {
        snap = { ...line, point };
        best = d;
      }
    }
    return snap;
  };
  const start = nearest(from);
  const end = nearest(to);
  if (!start || !end) return [];
  if (start.a === end.a && start.b === end.b) {
    const a = graph.get(start.a)!;
    if (!start.oneway || distance(a, end.point) >= distance(a, start.point)) {
      return [start.point, end.point];
    }
  }
  const goal = '@destination';
  const dist = new Map<string, number>();
  const previous = new Map<string, string>();
  const heap: { key: string; cost: number }[] = [];
  const push = (key: string, cost: number, parent: string) => {
    if (cost >= (dist.get(key) ?? Infinity)) return;
    dist.set(key, cost);
    previous.set(key, parent);
    heap.push({ key, cost });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].cost <= heap[i].cost) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const root = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[i].cost <= heap[child].cost) break;
        [heap[i], heap[child]] = [heap[child], heap[i]];
        i = child;
      }
    }
    return root;
  };
  push(start.b, distance(start.point, graph.get(start.b)!), '');
  if (!start.oneway) push(start.a, distance(start.point, graph.get(start.a)!), '');
  while (heap.length > 0) {
    const current = pop();
    if (current.cost !== dist.get(current.key)) continue;
    if (current.key === goal) break;
    if (current.key === end.a || (!end.oneway && current.key === end.b)) {
      push(goal, current.cost + distance(graph.get(current.key)!, end.point), current.key);
    }
    for (const [key, cost] of graph.get(current.key)!.edges) {
      push(key, current.cost + cost, current.key);
    }
  }
  if (!dist.has(goal)) return [];
  const points: Point[] = [end.point];
  for (let key = previous.get(goal)!; key; key = previous.get(key)!) {
    const node = graph.get(key)!;
    points.push({ x: node.x, z: node.z });
  }
  points.push(start.point);
  return points.toReversed();
}
