import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BoardNode,
  inkUpgrades,
  placeables,
  type Placeable,
  type Point,
} from './relay-model';
import { SAVE_EVENT, SAVE_KEY } from './board-stamp';

export interface BoardSave {
  medals: number[];
  best: number;
  credits: number;
  upgrades: string[];
  blueprint: string[];
  room: number;
  nodes: BoardNode[];
  sketches: Record<string, Point[]>;
}

export function readBoardSave(): BoardSave {
  const blank: BoardSave = {
    medals: [0, 0, 0, 0, 0],
    best: 0,
    credits: 0,
    upgrades: [],
    blueprint: [],
    room: 0,
    nodes: [],
    sketches: {},
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return blank;
    const legacy = !Number.isInteger(raw.room);
    const blueprint: string[] = Array.isArray(raw.blueprint)
      ? raw.blueprint
          .filter((id: unknown) => typeof id === 'string' && /^[a-z0-9]+:[a-z0-9]+$/.test(id))
          .slice(0, 32)
      : [];
    const nodes: BoardNode[] = [];
    if (Array.isArray(raw.nodes)) {
      for (const saved of raw.nodes.slice(0, 4)) {
        if (
          !saved ||
          !/^sticky[1-4]$/.test(saved.id) ||
          nodes.some((n) => n.id === saved.id) ||
          !Object.hasOwn(placeables, saved.kind) ||
          !Number.isFinite(saved.x) ||
          !Number.isFinite(saved.y)
        )
          continue;
        const kind = saved.kind as Placeable;
        nodes.push({
          id: saved.id,
          kind,
          title: placeables[kind],
          x: Math.max(230, Math.min(BOARD_WIDTH - 230, saved.x)),
          y: Math.max(165, Math.min(BOARD_HEIGHT - 165, saved.y)),
        });
      }
    }
    const sketches: Record<string, Point[]> = {};
    for (const id of blueprint) {
      const points = raw.sketches?.[id];
      if (Array.isArray(points))
        sketches[id] = points
          .slice(0, 64)
          .filter(
            (p: unknown): p is Point =>
              Array.isArray(p) &&
              p.length === 2 &&
              Number.isFinite(p[0]) &&
              p[0] >= 0 &&
              p[0] <= BOARD_WIDTH &&
              Number.isFinite(p[1]) &&
              p[1] >= 0 &&
              p[1] <= BOARD_HEIGHT,
          );
    }
    return {
      medals: blank.medals.map((_, i) => {
        const n = raw.medals?.[i];
        return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
      }),
      best: Math.max(0, Number(raw.best) || 0),
      credits: Math.max(0, Number(raw.credits) || 0),
      upgrades: ['heat', 'cache', ...inkUpgrades.map(({ id }) => id)].filter(
        (id) => Array.isArray(raw.upgrades) && raw.upgrades.includes(id),
      ),
      blueprint,
      room: legacy ? (blueprint.length > 0 ? 4 : 0) : Math.max(0, Math.min(4, raw.room)),
      nodes,
      sketches,
    };
  } catch {
    return blank;
  }
}

export function writeBoardSave(save: BoardSave) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // The session still plays without storage.
  }
  window.dispatchEvent(new CustomEvent<BoardSave>(SAVE_EVENT, { detail: save }));
}
