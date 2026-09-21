/**
 * Pure evaluation-date resolution shared by the `/evaluation` dashboard
 * context and the read-only views API (`/api/v1/views/evaluation`).
 *
 * Extracted from `EvaluationContext.tsx` so server route handlers can reuse
 * the exact dashboard behavior without importing a client component module.
 *
 * Resolution rules:
 * - no available dates → echo the requested date unchanged,
 * - empty request → latest available date,
 * - exact match → that date,
 * - otherwise → the available date nearest to the request.
 */
export function resolveEvaluationDate(
  requestedDate: string,
  availableDates: readonly string[],
): string {
  if (availableDates.length === 0) return requestedDate;
  if (!requestedDate) return availableDates.at(-1)!;
  if (availableDates.includes(requestedDate)) return requestedDate;

  const target = new Date(requestedDate).getTime();
  return availableDates.reduce((closest, date) => {
    const closestDifference = Math.abs(new Date(closest).getTime() - target);
    const difference = Math.abs(new Date(date).getTime() - target);
    return difference < closestDifference ? date : closest;
  }, availableDates[0]);
}
