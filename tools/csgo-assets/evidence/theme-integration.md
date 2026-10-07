# Landing launcher and optional-theme isolation

The CS:GO theme now includes a native game-preview link on `/` and `/zh`.
The private Perplexity destination requires preview access. It is not a public
production game deployment. The requester explicitly retained the 95%
game-completion condition on October 6, 2026: keep PR #1282 draft and unmerged.

## Scope and checks

The game remains outside the dashboard bundle. Only the lazy CS:GO leaf imports
the launcher. Its subscription shares the existing SSR/embed guard rather than
adding another root observer. No route, metadata, sitemap, data/API, or public
skills contract changes were made.

Local verification used the optimized Next.js build with `E2E_FIXTURES=1`,
Node 24, Bun 1.4.0, and Chromium. Fixture data is not current benchmark data.

- Production build and TypeScript passed; 1,485 static pages generated.
- The 10 focused launcher/decoration/lazy-boundary tests passed.
- The full app unit suite passed: 6,210 tests across 396 files; four tests skipped.
  An initial run had two environment failures because `bun` was absent from PATH.
  A full repeat with Node 24 and Bun 1.4.0 on PATH passed.
- All 28 existing game/asset tests passed.
- Repository-wide Oxlint passed with no warnings or errors.
- Six cold loads covered English/Chinese, desktop/mobile, light/dark/system,
  and no saved theme. No optional-theme asset requests or optional-font faces
  were observed. Loaded first-party JS/CSS was scanned for the same optional
  code markers used by the committed Cypress regression.
- Four embed loads, one for each saved optional theme, requested no optional
  assets and mounted no theme banner or launcher.
- English desktop and Chinese mobile CS:GO launchers preserved title,
  description, canonical, hreflang, JSON-LD and h1/h2 content. Hover/focus made
  no game request. A real click opened the exact destination in a new tab.
  The destination response was intercepted for this link test; this does not
  establish public access to the private preview.
- All four optional themes mounted and unmounted through the picker on
  `/about`, preserving the same SEO fields.
- Googlebot HTML requests for `/` and `/zh` contained title, description,
  canonical, Chinese hreflang, JSON-LD and headings, with no game launcher.
- Desktop and narrow mobile screenshots were visually reviewed. The launcher
  has no horizontal overflow and remains legible in the existing CS:GO theme.

Raw browser observations are in `theme-integration.json`; screenshots are
`theme-landing-desktop.png`, `theme-landing-mobile-zh.png`, and
`theme-default-light.png`. The browser audit script is included alongside the
results for reproducibility. Equivalent regression cases are committed in
`packages/app/cypress/e2e/optional-theme-isolation.cy.ts`; the Cypress runner
itself was not executed locally.

To repeat the browser audit, start the fixture production server on port 3000,
install Playwright in the test environment, launch Chromium, and pass that
browser to the exported `run(browser, { origin, out })` function in
`theme-audit.mjs`. `origin` defaults to `http://127.0.0.1:3000`; output defaults
to `/tmp/inferencex-theme-audit`. The audit closes its own contexts, not the
caller-owned browser.

## Limits

These are resource-boundary and content checks, not a measured before/after
field Web Vitals result. Existing shared picker/subscription code still has a
small cost. Marker scans do not prove absence of every possible engine symbol.
No claim of universally zero overhead, unchanged search ranking, 95% game
parity, independent asset-license verification, public game access, or
independent Chinese-copy approval is made.

AI implementation and inspection: GPT-6 Astra Ultrafast. No delegated reviewers.
