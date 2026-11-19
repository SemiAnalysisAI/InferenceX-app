# App source organization

`packages/app/src/components/` groups rendered UI by feature or shared responsibility.
`packages/app/src/lib/` groups supporting modules by the domain that owns them.
Tests and small data files stay beside the implementation they exercise or support.
Next.js route entry points remain in `src/app/`; shared React providers live in
`src/providers/`.

Existing feature directories continue to own their components. A component shared by
several features belongs with its shared responsibility, rather than whichever feature
first imported it.

`optional-theme-imports.test.ts` deliberately remains at the `src/lib/` root: the
[easter-egg policy](./testing.md#easter-egg-themes-and-games) names that exact
main-site isolation check.

## Import and refactor conventions

- Import the owning module directly. Folder membership does not imply that its
  modules are all safe to load on the client; preserve `server-only`, `use client`,
  and lazy-import boundaries. Avoid umbrella re-export files that combine them.
- Keep tests colocated and update mock specifiers with production imports so both
  refer to the same module instance.
- File moves must preserve relative asset/fixture resolution, source-scanner roots,
  generator output directories, and tool configuration. Update documentation links
  and script provenance paths as well as TypeScript imports.
- Refresh API review digests only after reviewing the referenced changes. A move
  does not change the API contract; verify the generated OpenAPI document remains
  identical when refreshing digests for import-only changes.
- Preserve UI copy, calculations, exports, route URLs, provider order, and test
  assertions in organizational refactors. Review normalized code and resolved
  module targets in addition to running typecheck, unit tests, browser tests, and
  a production build.
