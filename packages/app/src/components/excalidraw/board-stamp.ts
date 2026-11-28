export const SAVE_KEY = 'excalidraw-relay-v1';
export const SAVE_EVENT = 'excalidraw-relay-save';

export interface BoardStamp {
  medals: number[];
  best: number;
  blueprint: string[];
  nodes: unknown[];
}

export function readBoardStamp(): BoardStamp | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    return {
      medals: Array.from({ length: 5 }, (_, i) =>
        [1, 2, 3].includes(raw.medals?.[i]) ? raw.medals[i] : 0,
      ),
      best: Math.max(0, Number(raw.best) || 0),
      blueprint: Array.isArray(raw.blueprint)
        ? raw.blueprint.filter((id: unknown) => typeof id === 'string')
        : [],
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    };
  } catch {
    return null;
  }
}
