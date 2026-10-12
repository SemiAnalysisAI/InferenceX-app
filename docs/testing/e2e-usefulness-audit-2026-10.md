# E2E usefulness audit, October 2026

This audit ranks all 996 registered runtime tests from the
[full baseline run](https://github.com/SemiAnalysisAI/InferenceX-app/actions/runs/38309315659).
Chrome and Firefox each registered the same 996 cases. It retires 249,
exactly 25%, leaving 747. Those cases came from 916 source-level `it()`
declarations at revision `3f52f8becd7906abdd4eb8e90f7b1594077cd0ca`; the
remaining suite has 667 declarations because parameterized tests register
multiple runtime cases. A case reduction is not a claim that the same
fraction of browser execution time or assertions disappeared.

## Ranking and selection

The adjacent JSON contains every original test's rank, file, original line,
suite, runtime title, source title, initial review score, final marginal-usefulness score, action,
and rationale. Consolidations name the surviving assertion owner using its
original identity. Rank 1 is least useful as a standalone E2E case.

- **Scores 1–2:** Repeated presence/copy checks, behavior already exercised by a
  stronger test, or a fragment of a stateful workflow that belongs with its setup.
- **Score 3:** Distinct route, browser, or viewport integration. Some initially
  low-scored cases remain because deleting them would lose unique coverage;
  others were strengthened rather than removed.
- **Scores 4–5:** Numerical correctness, publication integrity, actual navigation
  and persistence, error recovery, evidence provenance, or resource isolation.
  No initially score-4 or score-5 declaration was retired.

The change deletes 118 low-signal checks and consolidates the useful assertions
from 131 others. This deliberately distinguishes deletion from consolidation.
Examples of deletion include a second SVG-presence assertion, title-only
snapshots, and hydration tests that never checked their claimed parameter
semantics. Examples of consolidation include expand/collapse pairs, metric
selection followed by its badge assertions, and a legend selection followed
by its reset.

Ten independent reviewers scored disjoint file groups by reading test bodies,
hooks, and relevant lower-level coverage. Selection also considered whether
removing a test would remove setup consumed by a later test. Their initial
scores are evidence, not an automatic deletion threshold. Final ranking
reflects the marginal value of keeping a separate declaration.

## Retained coverage and refactoring

`optional-theme-isolation.cy.ts` is unchanged. Its production-build checks for
ordinary clicks, optional requests/resources/fonts, DOM/media cleanup, preference
migration, embeds, metadata, and lazy-chunk failure recovery remain required.
Chart geometry remains covered by the retained chart specs. Overlay evidence,
export units, numerical data, failure/retry paths, and navigation/history checks
remain.

The shared CSV download helper is used by the overlay export regression and a
five-route export contract. The latter verifies actual CSV bytes, route-specific
headers, nonempty numeric data, and finite values instead of only a menu label.
The redirect helper verifies a 308 destination and a direct 200 canonical
response; query preservation is checked before client hydration can rewrite
the address bar. Calculator metric cases share a typed scenario table.

Consolidation does not make the entire legacy suite independently runnable in
arbitrary test order. Some specs still intentionally share a page with
`testIsolation: false`. This change removes selected cross-test dependencies
without changing that global policy or weakening browser exception handling.

## Timing evidence and sharding

`cypress-split` remains the scheduler. Chrome uses `timings.json`, Firefox uses
`timings-firefox.json`, and component tests use `component-timings.json`.
The balance report invokes the installed scheduler itself, so it cannot drift
from a separately implemented packing algorithm.

Every CI shard uploads raw observations from Cypress's run result, including
the duration and full title of every runtime test. These are not the plugin's
merged output, which may contain old measurements for unexecuted specs.
The refresh job accepts only a complete 8-Chrome/8-Firefox/4-component matrix
from one revision, run, and attempt, with every current spec exactly once and
no failed, skipped, or pending tests. It rejects duplicate/missing shards,
missing per-test data, stale spec names, and invalid durations before writing
any baseline.

A content fingerprint also requires the observed application, test, fixture,
configuration, and dependency inputs to match the current checkout. Timing
JSON and documentation are excluded, so committing measured baselines does
not invalidate the evidence that produced them.

The resulting artifact includes all three timing files and a per-browser
shard report. For each suite, the report compares the longest predicted shard
against `max(total duration / shard count, longest individual spec)`. A single
long spec is indivisible; unequal shard totals alone do not establish bad
packing. Spec timings include hooks and other per-spec execution overhead;
per-test timings are diagnostic and are not summed to invent spec durations.
The refresh fails if the longest packed shard exceeds this lower bound by more
than 10%, requiring investigation before the generated baselines are accepted.

To refresh the committed baselines after a successful full run:

```sh
gh run download RUN_ID --pattern 'cypress-timings-*' --dir /tmp/cypress-observations
bun packages/app/scripts/refresh-cypress-timings.ts /tmp/cypress-observations
```

Use a fresh destination directory, review the generated diff and balance
report, and commit the baselines on a branch. CI publishes an artifact; it
does not push commits or silently rewrite the repository.

This JSON is a historical audit snapshot, not a permanent cap on suite size.
New regression tests should be added when they establish behavior not already
covered by a cheaper or stronger test.
