---
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(git blame:*), Bash(pnpm test:*), Bash(pnpm typecheck*), Bash(pnpm lint*), Bash(pnpm dev*), Bash(curl:*), Read, Glob, Grep
description: Systematic debugging — root cause before fixes
---

Systematically debug the issue described by the user. Do NOT guess or propose fixes until you have completed Phase 1.

**Announce at start:** "Using systematic debugging — finding root cause before proposing fixes."

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## Phase 1: Root Cause Investigation

BEFORE attempting ANY fix:

1. **Read Error Messages Carefully**
   - Read stack traces completely — note line numbers, file paths, error codes
   - Don't skip past warnings

2. **Reproduce Consistently**
   - Can you trigger it reliably? What are the exact steps?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - `git diff`, recent commits, new dependencies, config changes

4. **Gather Evidence in Multi-Component Systems**
   - This repo has: Frontend → React Query hooks → API routes → Neon DB
   - Check `docs/pitfalls.md` — the issue may be a documented failure mode
   - For each component boundary: verify what data enters and exits
   - Run once to gather evidence showing WHERE it breaks

5. **Trace Data Flow**
   - Where does the bad value originate?
   - Trace backward through the call stack until you find the source
   - Fix at source, not at symptom

## Phase 2: Pattern Analysis

1. **Find Working Examples** — locate similar working code in the codebase
2. **Compare** — what's different between working and broken?
3. **Check docs/** — read relevant subsystem docs via `docs/index.md`

## Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is the root cause because Y"
2. **Test Minimally** — smallest possible change, one variable at a time
3. **Verify** — did it work? If not, form NEW hypothesis. Don't stack fixes.

## Phase 4: Implementation

1. **Create Failing Test** — regression test reproducing the bug with exact triggering input (per CLAUDE.md testing requirements)
2. **Implement Single Fix** — address root cause, ONE change, no "while I'm here" improvements
3. **Verify Fix** — run `pnpm test:unit` and `pnpm typecheck`, confirm no other tests broken

## Red Flags — STOP and Return to Phase 1

If you catch yourself thinking:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"

If **3+ fixes have failed**: STOP. The issue is likely architectural. Discuss with the user before attempting more fixes.

_Adapted from [obra/superpowers](https://github.com/obra/superpowers) systematic-debugging skill._
