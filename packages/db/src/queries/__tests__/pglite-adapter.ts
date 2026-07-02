/**
 * postgres.js-compatible tagged-template adapter over PGlite.
 *
 * The query functions in `queries/*.ts` take a {@link DbClient} — a tagged-template
 * callable that returns `Promise<Row[]>` — and, crucially, *compose* nested `sql``
 * fragments into an outer query (e.g. `getLatestBenchmarks`'s `dateFilter` / `runFilter`,
 * `getEvalSamples`'s `passedFilter`). postgres.js supports this: a nested `sql`` call
 * produces a fragment whose SQL text and parameters are spliced into the parent query,
 * with placeholder numbers ($1, $2, …) renumbered across the whole flattened statement.
 *
 * PGlite's own `.sql`` tag does NOT support this fragment nesting, so this adapter
 * re-implements exactly that composition semantics on top of `pglite.query(text, params)`:
 *
 *   - Calling the adapter as a tag returns a lazily-evaluated {@link Fragment} (a thenable).
 *   - When a Fragment is interpolated into another `sql`` call, it is recognized and its
 *     text + params are inlined (not bound as a single parameter), matching postgres.js.
 *   - An empty fragment (`sql\`\``) inlines to the empty string with no params — this is how
 *     the query code turns a filter off (e.g. `exact ? … : sql\`\``).
 *   - Awaiting a top-level Fragment flattens it to `{ text, params }`, renumbers the
 *     placeholders left-to-right, runs it through `pglite.query`, and resolves to `.rows`
 *     so the shape matches the `DbClient` contract (`Promise<Row[]>`).
 *
 * This is deliberately minimal — it implements only the postgres.js features the query
 * files actually use (value interpolation, `ANY($array)`, `::type` casts, nested fragment
 * composition). It is NOT a general postgres.js shim.
 */

import type { PGlite } from '@electric-sql/pglite';

import type { DbClient } from '../../connection.js';

/** Sentinel brand so interpolated fragments are distinguishable from plain values. */
const FRAGMENT = Symbol('pglite-adapter-fragment');

interface FragmentNode {
  [FRAGMENT]: true;
  strings: readonly string[];
  values: unknown[];
}

/** A composed SQL fragment; thenable so a top-level `await sql\`…\`` executes it. */
export type Fragment = FragmentNode & Promise<Record<string, unknown>[]>;

function isFragment(v: unknown): v is FragmentNode {
  return (
    typeof v === 'object' && v !== null && (v as Record<PropertyKey, unknown>)[FRAGMENT] === true
  );
}

/**
 * Flatten a fragment tree into a single parameterized statement, renumbering `$N`
 * placeholders left-to-right. Nested fragments are inlined (their text spliced in,
 * their params appended in order); every other interpolated value becomes one bound
 * parameter. Mirrors postgres.js fragment flattening.
 */
function flatten(node: FragmentNode): { text: string; params: unknown[] } {
  let text = '';
  const params: unknown[] = [];

  const { strings, values } = node;
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      const value = values[i];
      if (isFragment(value)) {
        const inner = flatten(value);
        // Shift the inner fragment's placeholders past the params collected so far.
        text += renumber(inner.text, params.length);
        params.push(...inner.params);
      } else {
        params.push(value);
        text += `$${params.length}`;
      }
    }
  }

  return { text, params };
}

/** Rewrite `$1, $2, …` in a fragment's text so they continue after `offset` existing params. */
function renumber(text: string, offset: number): string {
  if (offset === 0) return text;
  return text.replaceAll(/\$(?<n>\d+)/gu, (_m, n: string) => `$${Number(n) + offset}`);
}

/**
 * Build a {@link DbClient} backed by a PGlite instance. The returned callable can be
 * passed anywhere a postgres.js/neon `sql` client is expected by `queries/*.ts`.
 */
export function makePgliteClient(pg: PGlite): DbClient {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Fragment => {
    const node: FragmentNode = { [FRAGMENT]: true, strings, values };

    // Lazily execute only when awaited at the top level. A fragment interpolated
    // into another `sql\`\`` is consumed by flatten() before its `then` ever runs.
    let promise: Promise<Record<string, unknown>[]> | null = null;
    const run = (): Promise<Record<string, unknown>[]> => {
      if (!promise) {
        const { text, params } = flatten(node);
        promise = pg.query(text, params).then((r) => r.rows as Record<string, unknown>[]);
      }
      return promise;
    };

    const frag = node as Fragment;
    // Intentionally thenable: this IS the postgres.js contract — a `sql\`\`` value that
    // executes when awaited at the top level but is inlined (never awaited) when composed
    // into another query. That's the whole point of the adapter.
    // oxlint-disable-next-line no-thenable
    frag.then = ((onF, onR) => run().then(onF, onR)) as Fragment['then'];
    frag.catch = ((onR) => run().catch(onR)) as Fragment['catch'];
    frag.finally = ((onFin) => run().finally(onFin)) as Fragment['finally'];
    return frag;
  };

  return tag as unknown as DbClient;
}
