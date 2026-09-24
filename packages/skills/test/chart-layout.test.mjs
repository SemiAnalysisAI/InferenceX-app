import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_COLUMNS,
  barChart,
  chooseBarForm,
  chooseTableForm,
  fitText,
  format,
  tableImage,
  textBox,
  textWidth,
} from '../skills/inferencex-api/scripts/chart-layout.mjs';

const row = (label, value) => ({ label, value, text: format.quantity(value) });
const rows = (count, label = (i) => `source-${i}`) =>
  Array.from({ length: count }, (_, i) => row(label(i), 10 ** (i % 7) * (i + 1)));
const chart = (data) =>
  barChart({ eyebrow: 'e', title: 'Title', subtitle: 'Subtitle', rows: data, footer: ['Note'] });
const columns = [
  { key: 'requests', label: 'Requests', group: 'Volume', format: format.count },
  { key: 'share', label: 'Share', group: 'Volume', format: format.share, bar: true },
  { key: 'latency', label: 'Latency', group: 'Median', format: format.duration },
];
const table = (count, label = (i) => `source-${i}`) =>
  tableImage({
    eyebrow: 'e',
    title: 'Title',
    columns,
    rows: Array.from({ length: count }, (_, i) => ({
      label: label(i),
      values: { requests: count - i, share: (count - i) / 100, latency: i ? 1000 * i : null },
    })),
  });

test('chart form follows the number of categories and label length', () => {
  assert.equal(chooseBarForm([]), 'empty');
  assert.equal(chooseBarForm(rows(1)), 'figure');
  assert.equal(chooseBarForm(rows(2)), 'columns');
  assert.equal(chooseBarForm(rows(MAX_COLUMNS)), 'columns');
  assert.equal(chooseBarForm(rows(MAX_COLUMNS + 1)), 'bars');
  assert.equal(chooseBarForm(rows(3, (i) => `${'very-long-agent-name/'.repeat(4)}${i}`)), 'bars');
  assert.equal(chooseTableForm(rows(4)), 'comparison');
  assert.equal(chooseTableForm(rows(5)), 'ranked');
  assert.equal(table(0).form, 'empty');
});

test('width stays fixed while height grows with rows', () => {
  const heights = [8, 14, 20].map((count) => chart(rows(count)).height);
  for (const count of [0, 1, 2, 7, 8, 20]) assert.equal(chart(rows(count)).width, 1200);
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2], heights.join(' < '));
  assert.ok(table(20).height > table(5).height);
});

test('ranked bars sort by value and keep unavailable and aggregate rows last', () => {
  const data = [
    row('small', 1),
    row('none', null),
    row('big', 100),
    row('mid', 10),
    { ...row('Other', 500), muted: true },
    ...rows(4, (i) => `extra-${i}`).map((item) => ({ ...item, value: 0.5 })),
  ];
  const labels = chart(data)
    .items.filter((item) => item.kind === 'text' && item.anchor === 'end' && item.size < 20)
    .map((item) => item.value);
  assert.deepEqual(labels.slice(0, 3), ['big', 'mid', 'small']);
  assert.deepEqual(labels.slice(-2), ['none', 'Other']);
});

test('text stays inside the canvas for every data size and label length', () => {
  const labels = [
    (i) => `s${i}`,
    (i) => `claude-code/task-subagent-${i}`,
    (i) => `${'planner/long-horizon-replanning-agent/'.repeat(3)}${i}`,
    (i) => `${'W'.repeat(90)}${i}`,
  ];
  for (const label of labels) {
    for (const count of [1, 2, 3, 5, 7, 8, 14, 20]) {
      for (const drawing of [chart(rows(count, label)), table(count, label)]) {
        assert.ok(!drawing.svg.includes('NaN'));
        for (const item of drawing.items.filter((entry) => entry.kind === 'text')) {
          const box = textBox(item);
          assert.ok(
            box.left >= 0 && box.right <= drawing.width + 0.5,
            `${drawing.form} ${count}: "${item.value}" spans ${box.left}–${box.right}`,
          );
        }
      }
    }
  }
});

test('long labels wrap at separators, then keep both ends with a middle ellipsis', () => {
  const wrapped = fitText('claude-code/task-subagent/web-search-tool', 260, 19, 400, 2);
  assert.equal(wrapped.truncated, false);
  assert.equal(wrapped.lines.length, 2);
  assert.ok(wrapped.lines.every((line) => textWidth(line, 19) <= 260));
  const cut = fitText(`${'agent/'.repeat(20)}final-worker`, 260, 19, 400, 1);
  assert.equal(cut.truncated, true);
  assert.match(cut.lines[0], /^agent\/.*….*worker$/u);
  assert.ok(textWidth(cut.lines[0], 19) <= 260);
  const truncated = chart(rows(9, (i) => `${'W'.repeat(80)}${i}`));
  assert.ok(truncated.items.some((item) => item.title?.startsWith('WWWW')));
});

test('numbers keep three significant digits, readable units and explicit gaps', () => {
  assert.equal(format.count(13933), '13,933');
  assert.equal(format.count(123_456_789), '123M');
  assert.equal(format.share(0.4285), '42.9%');
  assert.equal(format.share(0.0004), '<0.1%');
  assert.equal(format.share(0.99999), '>99.9%');
  assert.equal(format.share(0), '0%');
  assert.equal(format.quantity(null), '—');
  assert.equal(format.quantity(0), '0');
  assert.equal(format.quantity(15.5), '15.5');
  assert.equal(format.quantity(409), '409');
  assert.equal(format.quantity(92_038), '92.0K');
  assert.equal(format.quantity(1_234_567), '1.23M');
  assert.equal(format.duration(null), '—');
  assert.equal(format.duration(0), '0 ms');
  assert.equal(format.duration(0.0004), '0.400 µs');
  assert.equal(format.duration(0.1234), '123 µs');
  assert.equal(format.duration(450), '450 ms');
  assert.equal(format.duration(12_995), '13.0 s');
  assert.equal(format.duration(20_000_000), '333 min');
});

test('labels and titles are escaped once in the SVG', () => {
  const drawing = chart([row('<b>&"x"', 3), row('ok', 2)]);
  assert.ok(!drawing.svg.includes('<b>'));
  assert.match(drawing.svg, /&lt;b&gt;&amp;&quot;x&quot;/u);
});
