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
