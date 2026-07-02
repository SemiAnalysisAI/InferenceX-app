/**
 * Normalizations applied to BOTH paths before row-level equality assertions.
 * Every normalization here is documented with WHY it is safe (i.e. it erases a
 * representational difference that is not a semantic divergence).
 */

/**
 * Deep-normalize a single row so PGlite and json-provider outputs are directly
 * comparable. The differences erased:
 *
 *  1. bigint → number. PGlite returns `bigint`/`bigserial` columns (e.g. eval_results.id)
 *     as JS `bigint`; json-provider coerces the dump's string ids with `Number(...)`.
 *     Both represent the same integer. Our ids are well under 2^53 so Number() is exact.
 *  2. `undefined` → `null`. json-provider surfaces an absent `workers` column as
 *     `undefined` (optional field); PGlite returns SQL NULL as `null`. Same "no value".
 *     We also DROP keys whose value normalizes to null/undefined so a row that omits
 *     `workers` and a row that has `workers: null` compare equal.
 *  3. numeric strings → numbers for known-numeric columns. Postgres `numeric` (eval
 *     score) can arrive as a string; we coerce `score` specifically.
 *
 * Field ORDER is irrelevant because we compare via a canonical sorted-key form.
 */
export function normRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(row)) {
    const v = normValue(k, raw);
    if (v === undefined || v === null) continue; // drop null/undefined keys (see #2)
    out[k] = v;
  }
  return out;
}

/**
 * Timestamp columns the two paths represent with different precision:
 *  - SQL renders them via `to_char(ts, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` → NO millis
 *    (e.g. "2026-06-10T04:00:00Z").
 *  - json-provider returns the raw dump string, which postgres.js serialized from a
 *    JS Date → millis + Z (e.g. "2026-06-10T04:00:00.000Z").
 * Both are the same instant and every app consumer either localeCompares them
 * (sort), parses them to ms, or takes `.split('T')[0]` — none is sensitive to the
 * ".000". We canonicalize to the millis-less form for equality.
 * (`getRunConfigsByDate.run_started_at` falls back to created_at, so both are listed.)
 */
const TIMESTAMP_KEYS = new Set(['run_started_at', 'created_at', 'timestamp']);

function normValue(key: string, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'bigint') return Number(v);
  if (key === 'score' && typeof v === 'string') return Number(v);
  if (TIMESTAMP_KEYS.has(key) && typeof v === 'string') {
    return v.replace(/\.\d{3}Z$/u, 'Z');
  }
  if (Array.isArray(v)) return v.map((x, i) => normValue(`${key}[${i}]`, x));
  if (typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
      o[ik] = normValue(ik, iv);
    }
    return o;
  }
  return v;
}

/** Stable stringify with sorted keys, for canonical ordering + equality. */
export function canonical(row: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(normRow(row)));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).toSorted()) {
      o[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}

/** Normalize + sort a result set into a canonical order for SET equality. */
export function normSet(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(normRow).toSorted((a, b) => canonical(a).localeCompare(canonical(b)));
}

/** Normalize preserving order, for queries whose ORDER BY is fully deterministic. */
export function normOrdered(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(normRow);
}
