import { timingSafeEqual } from 'node:crypto';

export function bearerMatches(header: string, secret: string): boolean {
  const provided = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
