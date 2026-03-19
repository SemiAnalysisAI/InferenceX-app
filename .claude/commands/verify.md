---
allowed-tools: Bash(pnpm test:*), Bash(pnpm typecheck*), Bash(pnpm lint*), Bash(pnpm build*), Bash(pnpm dev*), Bash(pnpm fmt*), Bash(curl:*), Bash(git diff:*), Bash(git status*), Read, Glob, Grep
description: Verify work is complete before committing — evidence before claims
---

Run the full verification checklist before claiming work is done. Do NOT skip steps or claim success without evidence.

**Announce at start:** "Running verification checklist — evidence before claims."

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

## The Gate

```
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim
```

## Verification Checklist

Run each step. Report the actual output — not what you expect.

### 1. Type checking

```bash
pnpm typecheck
```

Required: exit 0, no errors

### 2. Linting

```bash
pnpm lint
```

Required: exit 0, no errors

### 3. Formatting

```bash
pnpm fmt
```

Required: exit 0, no formatting issues

### 4. Unit tests

```bash
pnpm test:unit
```

Required: all tests pass, 0 failures

### 5. Dev server starts

```bash
pnpm dev --hostname 0.0.0.0 --port 3000 &
curl --retry 10 --retry-delay 2 --retry-connrefused -sSf http://localhost:3000 >/dev/null
```

Required: server responds successfully

### 6. E2E tests

```bash
pnpm test:e2e
```

Required: all tests pass

### 7. Requirements check

- Re-read the original task/issue
- For each requirement, verify it's met with evidence
- Check: are new tests included where CLAUDE.md requires them?
  - New utility functions → colocated unit test
  - New UI features → E2E test
  - Bug fixes → regression test with exact triggering input
- Check: do new interactive elements have `track()` from `@/lib/analytics`?

## Output Format

```
## Verification Results

- [ ] typecheck: [PASS/FAIL] — [evidence]
- [ ] lint: [PASS/FAIL] — [evidence]
- [ ] fmt: [PASS/FAIL] — [evidence]
- [ ] unit tests: [PASS/FAIL] — [N/N passed]
- [ ] dev server: [PASS/FAIL] — [evidence]
- [ ] e2e tests: [PASS/FAIL] — [N/N passed]
- [ ] requirements: [MET/GAPS] — [details]

**Status:** [READY TO COMMIT / ISSUES TO FIX]
```

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Done!")
- About to commit without running this checklist
- Relying on a previous run instead of a fresh one

_Adapted from [obra/superpowers](https://github.com/obra/superpowers) verification-before-completion skill._
