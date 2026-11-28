import type { RecordBook } from './defense-routes';
import { useState } from 'react';
import type { ARCADE } from './arcade-copy';
type Copy = (typeof ARCADE)[keyof typeof ARCADE];
const MARKS = [
  [7, 61],
  [28, 37],
  [48, 55],
  [70, 22],
  [91, 42],
];
export function RouteAtlas({
  t,
  current,
  limit,
  book,
  select,
}: {
  t: Copy;
  current: number;
  limit: number;
  book: RecordBook;
  select?: (i: number) => void;
}) {
  return (
    <div className={`sp-atlas${select ? '' : ' sp-atlas-mini'}`} aria-label={t.atlas}>
      <svg viewBox="0 0 500 80" preserveAspectRatio="none" aria-hidden="true">
        <path fill="#d6e0c7" d="M0 0h500v80H0z" />
        <path
          fill="#b4c8a9"
          d="m0 15 39 17 40-25 65 18 33-17 55 19 39-19 42 19 47-18 58 12 42-16 40 7v-12H0"
        />
        <path
          d="M25-10q48 34 134 36t104 30 124 1 100 16"
          fill="none"
          stroke="#8fb6ba"
          strokeWidth="8"
        />
        <path d="M35 49 140 30 240 44 350 18 455 34" fill="none" stroke="#687e64" strokeWidth="5" />
        <path
          d="M35 49 140 30 240 44 350 18 455 34"
          fill="none"
          stroke="#f6e9bb"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
      </svg>
      {MARKS.map(([x, y], i) =>
        select ? (
          <button
            key={x}
            type="button"
            style={{ left: `${x}%`, top: `${y}%` }}
            disabled={i + 1 > limit}
            aria-label={`${i + 1}: ${t.stops[i]}`}
            aria-pressed={current === i + 1}
            onClick={() => select(i + 1)}
          >
            {i + 1}
            {book.stamps[i] > 0 ? '✓' : ''}
          </button>
        ) : (
          <span
            key={x}
            style={{ left: `${x}%`, top: `${y}%` }}
            data-here={current === i + 1 || undefined}
          >
            {i + 1}
          </span>
        ),
      )}
    </div>
  );
}
export function DepotBuilder({
  t,
  book,
  save,
}: {
  t: Copy;
  book: RecordBook;
  save: (b: RecordBook) => void;
}) {
  const [code, setCode] = useState(''),
    [result, setResult] = useState('');
  return (
    <fieldset className="sp-blueprint">
      <legend>{t.blueprint}</legend>
      <label>
        {t.slots}
        <select value={book.slot} onChange={(e) => save({ ...book, slot: Number(e.target.value) })}>
          {[0, 1, 2].map((i) => (
            <option key={i} value={i}>
              {t.blueprintLabel} {String.fromCodePoint(65 + i)}
            </option>
          ))}
        </select>
      </label>
      <p>{t.layoutTip}</p>
      <div>
        {t.lanes.map((s, i) => (
          <label key={s}>
            {i + 1}. {s}
            <select
              value={book.layouts[book.slot][i]}
              onChange={(e) => {
                const layouts = book.layouts.map((row) => [...row]);
                layouts[book.slot][i] = Number(e.target.value);
                save({ ...book, layouts });
              }}
            >
              {t.stationTypes.map((o, k) => (
                <option key={o} value={k}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label>
        {t.shareCode}
        <input
          type="text"
          data-sp-code=""
          value={code}
          maxLength={24}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setCode(e.target.value);
            setResult('');
          }}
        />
      </label>
      <small>{t.codeTip}</small>
      <div className="sp-code-actions">
        <button
          data-sp-export-code=""
          type="button"
          onClick={() => {
            setCode(
              `SP1-${book.labStop}-${String(book.seed).padStart(4, '0')}-${book.layouts[book.slot].join('')}`,
            );
            setResult(t.codeReady);
          }}
        >
          {t.codeOut}
        </button>
        <button
          data-sp-import-code=""
          type="button"
          onClick={() => {
            const m = /^SP1-(?<stop>[1-5])-(?<seed>\d{4})-(?<lanes>[012]{4})$/i.exec(
              code.trim(),
            )?.groups;
            if (!m) {
              setResult(t.codeBad);
              return;
            }
            save({
              ...book,
              seed: Number(m.seed),
              labStop: Number(m.stop),
              layouts: book.layouts.map((row, i) =>
                i === book.slot ? m.lanes.split('').map(Number) : row,
              ),
            });
            setResult(t.codeOK);
          }}
        >
          {t.codeIn}
        </button>
        <output role="status">{result}</output>
      </div>
    </fieldset>
  );
}
