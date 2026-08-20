import { timingSafeEqual } from 'node:crypto';

/** Compare a complete Authorization header with a Bearer secret using its encoded bytes. */
export function bearerMatches(header: string, secret: string): boolean {
  const provided = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
