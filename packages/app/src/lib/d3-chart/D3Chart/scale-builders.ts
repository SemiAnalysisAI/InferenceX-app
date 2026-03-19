import * as d3 from 'd3';

import type { ContinuousScale } from '../types';
import type { ScaleConfig } from './types';

export type BuiltScale =
  | d3.ScaleBand<string>
  | d3.ScaleLinear<number, number>
  | d3.ScaleLogarithmic<number, number>
  | d3.ScaleTime<number, number>;

/** Build a D3 scale from a declarative config. Pure function, no side effects. */
export function buildScale(config: ScaleConfig, range: [number, number]): BuiltScale {
  switch (config.type) {
    case 'band':
      return d3
        .scaleBand<string>()
        .domain(config.domain)
        .range(range)
        .padding(config.padding ?? 0.1);

    case 'linear': {
      const s = d3.scaleLinear().domain(config.domain).range(range);
      return config.nice !== false ? s.nice() : s;
    }

    case 'log': {
      const l = d3.scaleLog().domain(config.domain).range(range);
      return config.nice !== false ? l.nice() : l;
    }

    case 'time': {
      const t = d3.scaleTime().domain(config.domain).range(range);
      return config.nice !== false ? t.nice() : t;
    }
  }
}

/** Type guard: scale has continuous invert (linear, log, time — not band). */
export function isContinuousScale(scale: BuiltScale): scale is ContinuousScale {
  return 'invert' in scale && !('bandwidth' in scale);
}

/** Type guard: scale is a band scale. */
export function isBandScale(scale: BuiltScale): scale is d3.ScaleBand<string> {
  return 'bandwidth' in scale;
}
