/**
 * How the results view writes a measured value, so a latency, a cost or an energy reads the same
 * everywhere on the page. Presentation only: the API and the CSV keep every digit.
 */

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** About three significant figures ("35.4", "0.0132"); from 100 up, every whole digit ("1,118"). */
export const figures = (value: number): string =>
  value.toLocaleString(
    'en-US',
    Math.abs(value) >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 3 },
  );

/** `figures`, or null for a value that was not measured. */
export const reading = (value: number | null | undefined): string | null =>
  finite(value) ? figures(value) : null;

/**
 * A dollar amount without its sign: three decimals below $1 ("0.068"), cents from $1 ("1.23"),
 * and two significant figures below one cent ("0.0046"), so a cost never rounds to 0.
 */
export function dollarFigures(value: number): string {
  const abs = Math.abs(value);
  return abs >= 1
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs >= 0.01 || abs === 0
      ? value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : value.toLocaleString('en-US', { maximumSignificantDigits: 2 });
}

export const usd = (value: number): string => `$${dollarFigures(value)}`;

/** `usd`, or null for a cost that could not be modelled. */
export const cost = (value: number | null | undefined): string | null =>
  finite(value) ? usd(value) : null;

/** Energy per clip in kJ from joules: "138 kJ". */
export const kilojoules = (joules: number | null | undefined): string | null =>
  finite(joules) ? `${figures(joules / 1000)} kJ` : null;

/** A lower-is-better value against another: the difference as a share of the other ("29") and, from 2× apart, their ratio ("2.09"). */
export type Comparison =
  | { direction: 'same' }
  | { direction: 'better' | 'worse'; percent: string; times?: string };

/** Null unless both are measured and positive; a difference that rounds to 0% is the same. */
export function compareLower(
  subject: number | null | undefined,
  pair: number | null | undefined,
): Comparison | null {
  if (!finite(subject) || !finite(pair) || !(subject > 0) || !(pair > 0)) return null;
  const direction = subject < pair ? 'better' : 'worse';
  const ratio = Math.max(subject, pair) / Math.min(subject, pair);
  const percent = Math.round((Math.abs(subject - pair) / pair) * 100);
  if (percent === 0) return { direction: 'same' };
  return ratio >= 2
    ? { direction, percent: String(percent), times: figures(ratio) }
    : { direction, percent: String(percent) };
}
