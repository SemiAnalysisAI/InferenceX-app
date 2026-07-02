/** Layout constants shared by the timeline component and its SVG content. */

// The timeline body is capped at this height and scrolls internally, so a run
// with many conversations/workers doesn't make the card grow unbounded and push
// the rest of the detail page down. Sized to show ~16 rows + the header.
export const TIMELINE_BODY_MAX_HEIGHT = 480;

// Wide enough for a full 36-char conversation id at 10px font, plus the
// indent + color stripe + count badge. Subagent rows inherit the same
// width but truncate the longer "↳ subagent N · hash" tail with ellipsis.
export const LABEL_WIDTH = 360;
export const ROW_HEIGHT = 22;
export const ROW_GAP = 3;
export const HEADER_HEIGHT = 24;
export const PADDING_RIGHT = 12;
export const CHART_WIDTH = 920;

/** Chart height for a given row count (header + rows + bottom padding). */
export function timelineSvgHeight(rowCount: number): number {
  return HEADER_HEIGHT + rowCount * (ROW_HEIGHT + ROW_GAP) + 6;
}
