// Types for the `bun:test` module only. The full Bun globals (`@types/bun`) would replace the DOM
// `fetch` type the app is checked against.
/// <reference types="bun-types/test" />

// bun:test types the expected value of these matchers as the received type; these tests were
// written against Vitest's looser `expected: unknown` signatures (unions narrowed by the code under
// test, literal ids outside a union), so accept any expected value as Vitest did. packages/db does
// the same; next build checks this package on its own, so it needs its own copy.
/* oxlint-disable typescript/method-signature-style -- only method signatures merge as overloads */
declare module 'bun:test' {
  interface Matchers<T> {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
  }
}
