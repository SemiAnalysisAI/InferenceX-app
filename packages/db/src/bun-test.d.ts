// Types for the `bun:test` module only. The full Bun globals (`@types/bun`) would replace the DOM
// `fetch` type that packages/app is checked against, since the root tsconfig checks every package.
/// <reference types="bun-types/test" />

// bun:test types the expected value of these matchers as the received type; these tests were
// written against Vitest's looser `expected: unknown`-style signatures (e.g. `undefined` rows in
// `it.each` tables, query rows typed by the driver), so accept any expected value as Vitest did.
/* oxlint-disable typescript/method-signature-style -- only method signatures merge as overloads */
declare module 'bun:test' {
  interface Matchers<T> {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
  }
}
