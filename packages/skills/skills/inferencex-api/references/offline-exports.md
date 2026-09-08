# Verify saved InferenceX evidence offline

Use this workflow for a completed contract 1 bundle created by one of the six
formal `inferencex` commands. Verification reads only the bundle directory, checks
the manifest, request ledger, response and result hashes, reconstructs the domain
result, and evaluates optional coverage policy.

```bash
mkdir -p reports
inferencex verify saved/powerx --report reports/powerx.md
inferencex verify saved/powerx --require-hardware h200_sxm
```

The installed equivalent is `node <skill>/scripts/inferencex.mjs verify ...`.
`--report` must name a new path outside the immutable bundle. Omitting it prints a
JSON summary; add `--human` for a concise human summary.

Branch on the exit code before parsing output:

- `0`: the bundle is valid and the requested policy passed or was absent.
- `3`: the bundle is valid, but `--require-hardware` or
  `--min-comparable-pairs` failed. Preserve and inspect the bundle.
- `1`: evidence is incomplete, malformed, tampered, inconsistent, or uses an
  unsupported contract.
- `2`: the command arguments are invalid.

Verification performs no HTTP request and runs no benchmark. Run it on a copy when
testing deliberate tampering, because completed bundles must remain unchanged.
Matching hashes and reconstructed output establish internal consistency, not
publisher authenticity or causal performance claims.

The 0.12.0 verifier accepts contract 1 bundle directories only. Separately saved exports from 0.11
and earlier and evidence directories require the pinned historical package that created
them; `verify-export.mjs` is not part of the 0.12.0 query interface.
