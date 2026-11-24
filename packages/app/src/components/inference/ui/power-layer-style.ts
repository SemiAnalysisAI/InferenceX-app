import type { Selection } from 'd3';

import {
  cssHatchAngle,
  HATCH_ANGLE,
  isHatchedBand,
  POWER_BAND_OPACITY,
  POWER_LAYER_FADED_OPACITY,
  powerBandFillOpacity,
  powerLayerEmphasis,
  powerLayerFill,
  type PowerBand,
  type PowerLayerEmphasis,
  type PowerLayerHighlight,
} from '../utils/power-breakdown';

/**
 * How the six power layers are drawn, shared by the breakdown plot, the legends,
 * the chip comparison's segments and the touch readout's chips: the chip colour
 * stepped down per layer (`POWER_BAND_OPACITY`), modeled layers hatched at their
 * own stripe angle, a highlighted layer raised and its siblings faded.
 */
const LAYER_STROKE_OPACITY = 0.9;
const HIGHLIGHT_STROKE_WIDTH = 1.5;

export interface LayerStyle {
  emphasis: PowerLayerEmphasis;
  /** The layer's own step (a hatched layer's pattern already carries its tint). */
  fillOpacity: number;
  /** Whole-element opacity: faded siblings of a highlighted layer. */
  opacity: number;
  strokeWidth: number;
  strokeOpacity: number;
}

/** How a layer is drawn under a highlight: its step and hatch stay, the rest fades. */
export function layerStyle(band: PowerBand, highlight: PowerLayerHighlight | null | undefined) {
  const emphasis = powerLayerEmphasis(band, highlight);
  const fillOpacity = isHatchedBand(band) ? 1 : POWER_BAND_OPACITY[band];
  if (emphasis === 'highlighted') {
    return {
      emphasis,
      fillOpacity,
      opacity: 1,
      strokeWidth: HIGHLIGHT_STROKE_WIDTH,
      strokeOpacity: 1,
    } satisfies LayerStyle;
  }
  return {
    emphasis,
    fillOpacity,
    opacity: emphasis === 'faded' ? POWER_LAYER_FADED_OPACITY : 1,
    strokeWidth: 1,
    strokeOpacity: LAYER_STROKE_OPACITY,
  } satisfies LayerStyle;
}

/**
 * A layer as a CSS box (legend swatch, comparison segment): the chip colour at
 * the layer's step, striped at its hatch angle when modeled, outlined in the
 * chip colour; faded like the plot's layer under a highlight.
 */
export function swatchStyle(
  band: PowerBand,
  color: string,
  highlight: PowerLayerHighlight | null = null,
): React.CSSProperties {
  const { opacity } = layerStyle(band, highlight);
  if (isHatchedBand(band)) {
    return {
      backgroundColor: powerLayerFill(color, powerBandFillOpacity(band)),
      backgroundImage: `repeating-linear-gradient(${cssHatchAngle(band)}deg, ${color} 0 2px, transparent 2px 6px)`,
      border: `1px solid ${color}`,
      opacity,
    };
  }
  return {
    backgroundColor: powerLayerFill(color, POWER_BAND_OPACITY[band]),
    border: `1px solid ${color}`,
    opacity,
  };
}

/**
 * The modeled layers' SVG hatches, one `<pattern>` per datum for fills to reference as
 * `url(#id)`: a 6 px tile at the layer's step under one stripe at its angle, both in the
 * datum's colour.
 */
export function joinHatchPatterns<Datum>(
  group: Selection<SVGGElement, unknown, null, undefined>,
  className: string,
  data: readonly Datum[],
  hatch: {
    key?: (d: Datum) => string;
    id: (d: Datum) => string;
    band: (d: Datum) => PowerBand;
    color: (d: Datum) => string;
  },
) {
  const pattern = group
    .selectAll<SVGPatternElement, Datum>(`pattern.${className}`)
    .data(data, hatch.key)
    .join((enter) => {
      const created = enter
        .append('pattern')
        .attr('class', className)
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 6)
        .attr('height', 6);
      created.append('rect').attr('class', 'hatch-bg').attr('width', 6).attr('height', 6);
      created
        .append('line')
        .attr('class', 'hatch-line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', 6)
        .attr('stroke-width', 2);
      return created;
    })
    .attr('id', hatch.id)
    .attr('patternTransform', (d) => `rotate(${HATCH_ANGLE[hatch.band(d)]})`);
  pattern
    .select('.hatch-bg')
    .attr('fill', hatch.color)
    .attr('fill-opacity', (d) => powerBandFillOpacity(hatch.band(d)));
  pattern.select('.hatch-line').attr('stroke', hatch.color);
  return pattern;
}

export { LAYER_STROKE_OPACITY };
