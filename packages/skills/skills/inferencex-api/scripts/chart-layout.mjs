// Standalone SVG bar charts and table images whose form follows the data: the
// number of rows, label lengths and value ranges choose the layout, so two
// categories and forty categories both stay legible without manual tuning.

export const xml = (value) =>
  String(value).replaceAll(
    /[<>&"']/gu,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char],
  );

const WIDTH = 1200;
const PAD = 56;
const CONTENT = WIDTH - 2 * PAD;
const INK = '#e8eaed';
const DIM = '#8a939c';
const RULE = '#252c34';
const AXIS = '#3a424b';
const ACCENT = '#2fa9ef';
// Identity colors for column charts; fixed order so a category keeps its color.
export const CATEGORY_COLORS = ['#2fa9ef', '#f7b041', '#63d6b3', '#b39aff', '#ff8fab', '#67d4e8'];
// Up to seven short-labeled categories render as columns; eight or more, or labels
// that need more than two lines, become ranked horizontal bars. Templates fold rows
// beyond MAX_ROWS into one grey aggregate row.
export const MAX_COLUMNS = 7;
// Distinct hues stay comfortable for up to three categories; beyond that one hue
// with direct labels reads cleaner than a rainbow.
const identityColor = (count, index) =>
  count <= 3 ? CATEGORY_COLORS[index % CATEGORY_COLORS.length] : ACCENT;
export const MAX_ROWS = 20;
// Tables put categories in columns (benchmark-table style) up to this count.
const MAX_TABLE_COLUMNS = 4;

// Helvetica advance widths (1/1000 em) for ASCII 32–126; Inter runs slightly wider.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

export function textWidth(value, size, weight = 400) {
  const table = weight >= 600 ? BOLD : REGULAR;
  let units = 0;
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    if (code >= 32 && code <= 126) units += table[code - 32];
    else if (char === '·') units += 278;
    // Hangul, CJK, full-width forms, dashes, symbols and emoji take about one em.
    else units += code >= 0x1100 ? 1000 : 600;
  }
  return (units / 1000) * size * 1.06;
}

// Shorten one line from the middle so distinguishing prefixes and suffixes survive.
function middleEllipsis(value, maxWidth, size, weight) {
  const chars = [...value];
  if (textWidth(value, size, weight) <= maxWidth) return value;
  let keep = chars.length - 1;
  while (keep > 1) {
    const head = Math.ceil(keep / 2);
    const candidate = `${chars.slice(0, head).join('')}…${chars.slice(chars.length - (keep - head)).join('')}`;
    if (textWidth(candidate, size, weight) <= maxWidth) return candidate;
    keep -= 1;
  }
  return '…';
}

// Wrap at identifier separators; text that still does not fit ends in a middle ellipsis.
export function fitText(value, maxWidth, size, weight = 400, maxLines = 1) {
  const text = String(value);
  if (textWidth(text, size, weight) <= maxWidth) return { lines: [text], truncated: false };
  const pieces = (text.match(/[^\s/:_.-]*[\s/:_.-]?/gu) ?? []).filter(Boolean);
  const lines = [];
  let current = '';
  for (const piece of pieces) {
    if (current && textWidth(current + piece, size, weight) > maxWidth) {
      lines.push(current);
      current = '';
    }
    current += piece;
  }
  if (current) lines.push(current);
  const clean = lines.map((line) => line.trim());
  if (clean.length <= maxLines && clean.every((line) => textWidth(line, size, weight) <= maxWidth))
    return { lines: clean, truncated: false };
  const kept = maxLines > 1 ? clean.slice(0, maxLines - 1) : [];
  const rest = maxLines > 1 ? clean.slice(maxLines - 1).join(' ') : text;
  if (kept.some((line) => textWidth(line, size, weight) > maxWidth)) {
    return { lines: [middleEllipsis(text, maxWidth, size, weight)], truncated: true };
  }
  return { lines: [...kept, middleEllipsis(rest, maxWidth, size, weight)], truncated: true };
}

// Three significant digits without exponents; `keep` retains trailing zeros so
// neighboring values align (13.0 s beside 8.12 s).
function significant(value, keep = false) {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  const text = value.toPrecision(3);
  return keep ? text : String(Number(text));
}

export const format = {
  count: (value) =>
    value >= 1e7 ? `${significant(value / 1e6)}M` : Math.round(value).toLocaleString('en-US'),
  share: (fraction) => {
    if (fraction === 0) return '0%';
    if (fraction < 0.001) return '<0.1%';
    if (fraction < 1 && fraction > 0.9995) return '>99.9%';
    return `${(fraction * 100).toFixed(1)}%`;
  },
  // Compact magnitude with three significant digits; zero stays zero.
  quantity: (value) => {
    if (value === null) return '—';
    if (value >= 1e6) return `${significant(value / 1e6, true)}M`;
    if (value >= 1e4) return `${significant(value / 1e3, true)}K`;
    if (value >= 100) return Math.round(value).toLocaleString('en-US');
    return value === 0 ? '0' : significant(value);
  },
  // Milliseconds in the largest readable unit; tiny positives never round to zero.
  duration: (ms) => {
    if (ms === null) return '—';
    if (ms === 0) return '0 ms';
    if (ms >= 1e7) return `${significant(ms / 60_000, true)} min`;
    if (ms >= 1000) return `${significant(ms / 1000, true)} s`;
    if (ms >= 1) return `${significant(ms, true)} ms`;
    if (ms >= 1e-6) return `${significant(ms * 1000, true)} µs`;
    return '<0.001 µs';
  },
};

// A drawing is a flat list of primitives so tests can check geometry directly.
const label = (x, y, value, size, options = {}) => ({
  kind: 'text',
  x,
  y,
  value,
  size,
  weight: options.weight ?? 400,
  fill: options.fill ?? INK,
  anchor: options.anchor ?? 'start',
  tabular: options.tabular ?? false,
  title: options.title,
  tail: options.tail,
  spacing: options.spacing ?? 0,
});

export function textBox(item) {
  const width =
    textWidth(item.value, item.size, item.weight) +
    item.spacing * [...String(item.value)].length +
    (item.tail ? textWidth(item.tail.value, item.size, item.tail.weight ?? 400) : 0);
  const left =
    item.anchor === 'end' ? item.x - width : item.anchor === 'middle' ? item.x - width / 2 : item.x;
  return {
    left,
    right: left + width,
    top: item.y - item.size * 0.8,
    bottom: item.y + item.size * 0.25,
  };
}

function header(items, spec) {
  items.push(
    label(PAD, 58, spec.eyebrow.toUpperCase(), 14, { weight: 600, fill: ACCENT, spacing: 1.6 }),
  );
  let size = 36;
  while (size > 26 && textWidth(spec.title, size, 700) > CONTENT) size -= 2;
  items.push(
    label(PAD, 106, fitText(spec.title, CONTENT, size, 700).lines[0], size, {
      weight: 700,
      spacing: -0.4,
    }),
  );
  if (spec.subtitle)
    items.push(label(PAD, 142, fitText(spec.subtitle, CONTENT, 20).lines[0], 20, { fill: DIM }));
  return spec.subtitle ? 142 : 106;
}

function footer(items, lines, top) {
  let y = top + 40;
  for (const line of lines) {
    for (const part of fitText(line, CONTENT, 16, 400, 2).lines) {
      items.push(label(PAD, y, part, 16, { fill: DIM }));
      y += 23;
    }
  }
  return y + 14;
}

function columnPath(x, y, width, height, radius = 4) {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function barPath(x, y, width, height, radius = 4) {
  const r = Math.min(radius, height / 2, width);
  return `M${x},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height - r}Q${x + width},${y + height} ${x + width - r},${y + height}H${x}Z`;
}

// rows: [{ label, value (number|null), text, detail?, muted? }]; value null is unavailable.
export function chooseBarForm(rows) {
  if (rows.length === 0) return 'empty';
  if (rows.length === 1) return 'figure';
  if (rows.length > MAX_COLUMNS) return 'bars';
  const slot = CONTENT / rows.length;
  const fits = rows.every(
    (row) => !fitText(row.label, slot - 20, columnLabelSize(rows.length), 400, 2).truncated,
  );
  return fits ? 'columns' : 'bars';
}

const columnLabelSize = (count) => (count <= 3 ? 22 : 19);

function drawFigure(items, row, top) {
  let size = 128;
  while (size > 48 && textWidth(row.text, size, 700) > CONTENT * 0.62) size -= 4;
  const baseline = top + 44 + size * 0.74;
  items.push(label(PAD, baseline, row.text, size, { weight: 700, spacing: -2 }));
  const x = PAD + textWidth(row.text, size, 700) + 40;
  const room = PAD + CONTENT - x;
  // The label sits beside the number when it has room, otherwise beneath it.
  const stacked = room < 260;
  const left = stacked ? PAD : x;
  const name = fitText(row.label, stacked ? CONTENT : room, 26, 600, 2);
  const nameTop = baseline - size * 0.74 + 26;
  let y = stacked ? baseline + 56 : nameTop + 8;
  for (const line of name.lines) {
    items.push(
      label(left, y, line, 26, { weight: 600, title: name.truncated ? row.label : undefined }),
    );
    y += 34;
  }
  if (row.detail) items.push(label(left, y, row.detail, 20, { fill: DIM }));
  return Math.max(baseline + size * 0.2, row.detail ? y : y - 34);
}

function drawColumns(items, rows, top) {
  const count = rows.length;
  const slot = CONTENT / count;
  const width = Math.min(240, Math.max(56, slot * 0.46));
  let valueSize = { 2: 56, 3: 50, 4: 44, 5: 38, 6: 34, 7: 30 }[count];
  while (valueSize > 20 && rows.some((row) => textWidth(row.text, valueSize, 700) > slot - 16))
    valueSize -= 2;
  const detail = rows.some((row) => row.detail);
  const plotTop = top + 44 + valueSize + (detail ? 30 : 0);
  const plotHeight = 340;
  const baseline = plotTop + plotHeight;
  const max = Math.max(0, ...rows.map((row) => row.value ?? 0));
  const labelSize = columnLabelSize(count);
  let bottom = baseline;
  items.push({
    kind: 'line',
    x1: PAD,
    x2: PAD + CONTENT,
    y1: baseline,
    y2: baseline,
    stroke: AXIS,
    width: 1.5,
  });
  rows.forEach((row, index) => {
    const center = PAD + slot * index + slot / 2;
    const height =
      row.value === null || max === 0
        ? 0
        : Math.max(row.value > 0 ? 2 : 0, (row.value / max) * plotHeight);
    const color = row.muted ? AXIS : identityColor(count, index);
    if (height > 0)
      items.push({
        kind: 'path',
        d: columnPath(center - width / 2, baseline - height, width, height),
        fill: color,
        title: `${row.label}: ${row.text}`,
      });
    const valueY = baseline - height - 14 - (detail ? 30 : 0);
    items.push(
      label(center, valueY, row.text, valueSize, {
        weight: 700,
        anchor: 'middle',
        fill: row.value === null ? DIM : INK,
      }),
    );
    if (row.detail)
      items.push(label(center, valueY + 30, row.detail, 18, { anchor: 'middle', fill: DIM }));
    const fitted = fitText(row.label, slot - 20, labelSize, 400, 2);
    fitted.lines.forEach((line, lineIndex) => {
      const y = baseline + 36 + lineIndex * (labelSize + 6);
      items.push(
        label(center, y, line, labelSize, {
          anchor: 'middle',
          title: fitted.truncated ? row.label : undefined,
        }),
      );
      bottom = Math.max(bottom, y);
    });
  });
  return bottom;
}

// Ranked forms order by value; unavailable and aggregate rows stay at the end.
const ranked = (rows, value) =>
  rows.toSorted(
    (a, b) =>
      Number(Boolean(a.muted)) - Number(Boolean(b.muted)) ||
      Number(value(a) === null) - Number(value(b) === null) ||
      (value(b) ?? 0) - (value(a) ?? 0),
  );

function drawBars(items, unsorted, top) {
  const rows = ranked(unsorted, (row) => row.value);
  const count = rows.length;
  const size = count <= 14 ? 19 : 17;
  const lineGap = size + 4;
  // Dense charts keep one line per row (middle ellipsis, full label in the tooltip).
  const fitted = rows.map((row) =>
    fitText(row.label, CONTENT * 0.42, size, 400, count <= 14 ? 2 : 1),
  );
  const wrapped = fitted.some((fit) => fit.lines.length > 1);
  // Fixed width, growing height: the row pitch tightens as rows are added.
  const rowHeight = Math.max(
    count <= 8 ? 58 : count <= 14 ? 46 : 38,
    wrapped ? 2 * lineGap + 14 : 0,
  );
  const thickness = Math.min(26, Math.round(rowHeight * 0.5));
  const labelWidth = Math.max(
    ...fitted.flatMap((fit) => fit.lines.map((line) => textWidth(line, size))),
  );
  const valueWidth = Math.max(
    ...rows.map(
      (row) =>
        textWidth(row.text, size, 700) + (row.detail ? textWidth(`  ${row.detail}`, size) : 0),
    ),
  );
  const x0 = PAD + labelWidth + 20;
  const span = PAD + CONTENT - valueWidth - 14 - x0;
  const max = Math.max(0, ...rows.map((row) => row.value ?? 0));
  const plotTop = top + 36;
  rows.forEach((row, index) => {
    const center = plotTop + index * rowHeight + rowHeight / 2;
    const fit = fitted[index];
    fit.lines.forEach((line, lineIndex) => {
      const y = center + size * 0.35 + (lineIndex - (fit.lines.length - 1) / 2) * lineGap;
      items.push(
        label(x0 - 20, y, line, size, {
          anchor: 'end',
          fill: row.muted ? DIM : INK,
          title: fit.truncated ? row.label : undefined,
        }),
      );
    });
    const length =
      row.value === null || max === 0
        ? 0
        : Math.max(row.value > 0 ? 2 : 0, (row.value / max) * span);
    if (length > 0)
      items.push({
        kind: 'path',
        d: barPath(x0, center - thickness / 2, length, thickness),
        fill: row.muted ? AXIS : ACCENT,
        title: `${row.label}: ${row.text}`,
      });
    items.push(
      label(x0 + length + 12, center + size * 0.35, row.text, size, {
        weight: 700,
        fill: row.value === null ? DIM : INK,
        tabular: true,
        tail: row.detail ? { value: `  ${row.detail}`, fill: DIM } : undefined,
      }),
    );
  });
  const bottom = plotTop + count * rowHeight;
  items.push({ kind: 'line', x1: x0, x2: x0, y1: plotTop, y2: bottom, stroke: AXIS, width: 1.5 });
  return bottom;
}

// spec: { eyebrow, title, subtitle, rows, footer: string[], description }
export function barChart(spec) {
  const items = [];
  const top = header(items, spec);
  const form = chooseBarForm(spec.rows);
  let bottom;
  if (form === 'empty') {
    items.push(
      label(PAD, top + 80, spec.emptyText ?? 'No data in this selection.', 24, { fill: DIM }),
    );
    bottom = top + 80;
  } else if (form === 'figure') bottom = drawFigure(items, spec.rows[0], top);
  else if (form === 'columns') bottom = drawColumns(items, spec.rows, top);
  else bottom = drawBars(items, spec.rows, top);
  const height = Math.ceil(footer(items, spec.footer ?? [], bottom));
  return { form, width: WIDTH, height, items, svg: toSvg(spec, items, height) };
}

// columns: [{ key, label, group?, format(value)→string, bar? }]; rows: [{ label, values, muted? }]
export function chooseTableForm(rows) {
  return rows.length > 0 && rows.length <= MAX_TABLE_COLUMNS ? 'comparison' : 'ranked';
}

function comparisonTable(items, spec, top) {
  const { columns, rows } = spec;
  const headSize = 18;
  const cellSize = 21;
  const metricWidth = Math.max(260, ...columns.map((column) => textWidth(column.label, 18) + 32));
  // Few sources keep compact columns instead of stretching across the canvas.
  const cellWidth = Math.min(280, (CONTENT - metricWidth) / rows.length);
  const headers = rows.map((row) => fitText(row.label, cellWidth - 24, headSize, 600, 2));
  const tableWidth = metricWidth + cellWidth * rows.length;
  const headerLines = Math.max(...headers.map((fit) => fit.lines.length));
  let y = top + 44;
  rows.forEach((row, index) => {
    const center = PAD + metricWidth + cellWidth * index + cellWidth / 2;
    if (rows.length <= 3)
      items.push({
        kind: 'rect',
        x: center - 14,
        y: y - 6,
        width: 28,
        height: 4,
        rx: 2,
        fill: identityColor(rows.length, index),
      });
    headers[index].lines.forEach((line, lineIndex) => {
      items.push(
        label(center, y + 22 + lineIndex * (headSize + 5), line, headSize, {
          weight: 600,
          anchor: 'middle',
          title: headers[index].truncated ? row.label : undefined,
        }),
      );
    });
  });
  y += 22 + (headerLines - 1) * (headSize + 5) + 18;
  items.push({ kind: 'line', x1: PAD, x2: PAD + tableWidth, y1: y, y2: y, stroke: AXIS });
  let group;
  for (const column of columns) {
    if (column.group && column.group !== group) {
      group = column.group;
      y += 34;
      items.push(label(PAD, y, column.group.toUpperCase(), 13, { weight: 600, fill: DIM }));
      y += 6;
    }
    const rowHeight = 46;
    const baseline = y + rowHeight / 2 + cellSize * 0.35;
    items.push(label(PAD, baseline, column.label, 18));
    rows.forEach((row, index) => {
      const center = PAD + metricWidth + cellWidth * index + cellWidth / 2;
      const value = row.values[column.key];
      items.push(
        label(center, baseline, column.format(value), cellSize, {
          weight: 500,
          anchor: 'middle',
          tabular: true,
          fill: value === null ? DIM : INK,
        }),
      );
    });
    y += rowHeight;
    items.push({ kind: 'line', x1: PAD, x2: PAD + tableWidth, y1: y, y2: y, stroke: RULE });
  }
  return y;
}

function rankedTable(items, spec, top) {
  const { columns } = spec;
  const rows = ranked(spec.rows, (row) => row.values[columns[0].key]);
  const size = rows.length <= 12 ? 18 : 16;
  const rowHeight = rows.length <= 12 ? 40 : 32;
  const headSize = 14;
  const barWidth = 72;
  const widths = columns.map(
    (column) =>
      Math.max(
        textWidth(column.label, headSize, 600),
        ...rows.map((row) => textWidth(column.format(row.values[column.key]), size, 600)),
      ) +
      (column.bar ? barWidth + 12 : 0) +
      30,
  );
  const numeric = widths.reduce((sum, width) => sum + width, 0);
  const nameWidth = Math.max(160, Math.min(CONTENT - numeric, 400));
  const names = rows.map((row) => fitText(row.label, nameWidth - 24, size, 400, 1));
  let y = top + 40;
  // Group labels span their columns; the column labels sit beneath them.
  let x = PAD + nameWidth;
  const groups = [];
  columns.forEach((column, index) => {
    const last = groups.at(-1);
    if (column.group && last?.name === column.group) last.right = x + widths[index];
    else if (column.group) groups.push({ name: column.group, left: x, right: x + widths[index] });
    x += widths[index];
  });
  for (const group of groups) {
    items.push(
      label(group.right, y, group.name.toUpperCase(), 12, {
        weight: 600,
        fill: DIM,
        anchor: 'end',
      }),
      { kind: 'line', x1: group.left + 18, x2: group.right, y1: y + 8, y2: y + 8, stroke: AXIS },
    );
  }
  y += groups.length > 0 ? 32 : 0;
  items.push(label(PAD, y, spec.nameLabel ?? '', headSize, { weight: 600, fill: DIM }));
  x = PAD + nameWidth;
  columns.forEach((column, index) => {
    items.push(
      label(x + widths[index], y, column.label, headSize, {
        weight: 600,
        fill: DIM,
        anchor: 'end',
      }),
    );
    x += widths[index];
  });
  y += 14;
  const tableRight = PAD + nameWidth + numeric;
  items.push({ kind: 'line', x1: PAD, x2: tableRight, y1: y, y2: y, stroke: AXIS });
  const maxima = columns.map((column) =>
    column.bar ? Math.max(0, ...rows.map((row) => row.values[column.key] ?? 0)) : 0,
  );
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0)
      items.push({ kind: 'line', x1: PAD, x2: tableRight, y1: y, y2: y, stroke: RULE });
    const baseline = y + rowHeight / 2 + size * 0.35;
    items.push(
      label(PAD, baseline, names[rowIndex].lines[0], size, {
        fill: row.muted ? DIM : INK,
        title: names[rowIndex].truncated ? row.label : undefined,
      }),
    );
    x = PAD + nameWidth;
    columns.forEach((column, index) => {
      const value = row.values[column.key];
      const right = x + widths[index];
      items.push(
        label(right, baseline, column.format(value), size, {
          weight: 500,
          anchor: 'end',
          tabular: true,
          fill: value === null || row.muted ? DIM : INK,
        }),
      );
      if (column.bar && value !== null && maxima[index] > 0) {
        const barX = x + 30;
        items.push(
          {
            kind: 'rect',
            x: barX,
            y: y + rowHeight / 2 - 4,
            width: barWidth,
            height: 8,
            rx: 4,
            fill: RULE,
          },
          {
            kind: 'rect',
            x: barX,
            y: y + rowHeight / 2 - 4,
            width: Math.max(value > 0 ? 3 : 0, (value / maxima[index]) * barWidth),
            height: 8,
            rx: 4,
            fill: row.muted ? AXIS : ACCENT,
          },
        );
      }
      x = right;
    });
    y += rowHeight;
  });
  items.push({ kind: 'line', x1: PAD, x2: tableRight, y1: y, y2: y, stroke: AXIS });
  return y;
}

// spec: { eyebrow, title, subtitle, columns, rows, nameLabel, footer: string[] }
export function tableImage(spec) {
  const items = [];
  const top = header(items, spec);
  const form = spec.rows.length === 0 ? 'empty' : chooseTableForm(spec.rows);
  let bottom;
  if (form === 'empty') {
    items.push(
      label(PAD, top + 80, spec.emptyText ?? 'No data in this selection.', 24, { fill: DIM }),
    );
    bottom = top + 80;
  } else if (form === 'comparison') bottom = comparisonTable(items, spec, top);
  else bottom = rankedTable(items, spec, top);
  const height = Math.ceil(footer(items, spec.footer ?? [], bottom));
  return { form, width: WIDTH, height, items, svg: toSvg(spec, items, height) };
}

function toSvg(spec, items, height) {
  const body = items.map((item) => {
    const title = item.title ? `<title>${xml(item.title)}</title>` : '';
    if (item.kind === 'line')
      return `<path d="M${item.x1},${item.y1}L${item.x2},${item.y2}" stroke="${item.stroke}"${item.width ? ` stroke-width="${item.width}"` : ''}/>`;
    if (item.kind === 'rect')
      return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}"${item.rx ? ` rx="${item.rx}"` : ''} fill="${item.fill}"/>`;
    if (item.kind === 'path') return `<path d="${item.d}" fill="${item.fill}">${title}</path>`;
    const attrs = [
      `x="${item.x.toFixed(1)}"`,
      `y="${item.y.toFixed(1)}"`,
      `font-size="${item.size}"`,
      item.weight === 400 ? '' : `font-weight="${item.weight}"`,
      item.anchor === 'start' ? '' : `text-anchor="${item.anchor}"`,
      `fill="${item.fill}"`,
      item.tabular ? 'class="num"' : '',
      item.spacing ? `letter-spacing="${item.spacing}"` : '',
    ].filter(Boolean);
    const tail = item.tail
      ? `<tspan fill="${item.tail.fill ?? DIM}" font-weight="${item.tail.weight ?? 400}">${xml(item.tail.value)}</tspan>`
      : '';
    return `<text ${attrs.join(' ')}>${title}${xml(item.value)}${tail}</text>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title description">`,
    `<title id="title">${xml(spec.title)}</title><desc id="description">${xml(spec.description ?? spec.subtitle ?? '')}</desc>`,
    `<style>text{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}.num{font-variant-numeric:tabular-nums}</style>`,
    `<rect width="100%" height="100%" fill="#0a0d10"/>`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}
