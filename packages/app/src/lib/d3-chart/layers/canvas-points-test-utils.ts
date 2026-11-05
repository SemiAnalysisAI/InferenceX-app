import * as d3 from 'd3';
import { vi } from 'vitest';

import { ensureCanvasPointLayer } from './canvas-points';

export interface Datum {
  id: string;
  precision: string;
  x: number;
  y: number;
  visible?: boolean;
}

export const key = (datum: Datum) => datum.id;
export const identity = d3.scaleLinear().domain([0, 1]).range([0, 1]);

export const config = {
  getColor: (d: Datum) => (d.id.startsWith('a') ? 'red' : 'blue'),
  getOpacity: (d: Datum) => (d.visible === false ? 0 : 1),
  getPointerEvents: (d: Datum) => (d.visible === false ? 'none' : 'auto'),
};

export function mountLayer() {
  const svg = d3.create('svg:svg');
  const zoomGroup = svg.append('g').attr('class', 'zoom-group').node()!;
  document.body.append(svg.node()!);
  const layer = ensureCanvasPointLayer<Datum>(zoomGroup);
  return { svg: svg.node()!, zoomGroup, layer };
}

export function installFrames() {
  let callback: FrameRequestCallback | null = null;
  let requests = 0;
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
    callback = next;
    requests++;
    return requests;
  });
  return {
    run(time: number) {
      const current = callback;
      callback = null;
      current?.(time);
    },
    pending: () => callback !== null,
    requests: () => requests,
  };
}

let recorded: unknown[][] = [];

class RecordingPath {
  readonly ops: unknown[][] = [];
  readonly source: string | undefined;

  constructor(source?: string) {
    this.source = source;
    recorded.push(['new Path2D', ...(source === undefined ? [] : [source])]);
  }

  arc(...args: unknown[]) {
    this.ops.push(['arc', ...args]);
  }

  rect(...args: unknown[]) {
    this.ops.push(['rect', ...args]);
  }

  addPath(path: RecordingPath) {
    this.ops.push(['addPath', path.source]);
  }
}

export function installRecordingContext(): unknown[][] {
  const calls: unknown[][] = [];
  recorded = calls;
  const context = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (...args: unknown[]) => {
          calls.push([
            String(property),
            ...args.map((arg) => (arg instanceof RecordingPath ? arg.ops : arg)),
          ]);
        },
      set: (_target, property, value) => {
        calls.push([`set:${String(property)}`, value]);
        return true;
      },
    },
  );
  vi.stubGlobal('Path2D', RecordingPath);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return calls;
}
