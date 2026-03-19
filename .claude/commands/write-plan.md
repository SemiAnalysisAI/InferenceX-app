---
allowed-tools: Bash(git log:*), Bash(git diff:*), Read, Glob, Grep
description: Write an implementation plan for a multi-step task
---

Write a comprehensive implementation plan for the task described by the user. Do NOT write any code — only produce the plan.

**Announce at start:** "Writing implementation plan — research first, then plan."

## Step 1: Research

Before writing anything:

1. Read `docs/index.md` and any relevant subsystem docs
2. Read CLAUDE.md for conventions and requirements
3. Explore the files/directories that will be affected
4. Understand existing patterns before proposing changes

## Step 2: Scope Check

If the task covers multiple independent subsystems, suggest breaking it into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## Step 3: File Map

Before defining tasks, map out which files will be created or modified and what each one is responsible for.

- Follow existing codebase patterns (path alias `@/*` → `packages/app/src/`)
- Files that change together should live together
- Check if similar features exist to follow as a template

## Step 4: Write the Plan

Use this format:

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence]

**Architecture:** [2-3 sentences about approach]

**Files:**

- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts`
- Test: `exact/path/to/file.test.ts`

---

### Task N: [Component Name]

**Files:**

- Create/Modify: `exact/path`
- Test: `exact/path`

- [ ] **Step 1: Write the failing test**
      [Exact test code]

- [ ] **Step 2: Run test to verify it fails**
      Run: `pnpm test:unit -- path/to/test`
      Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
      [Exact implementation code]

- [ ] **Step 4: Run test to verify it passes**
      Run: `pnpm test:unit -- path/to/test`
      Expected: PASS

- [ ] **Step 5: Commit**
```

## Task Granularity

Each step is one action (2-5 minutes):

- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to pass" — step
- "Run tests and confirm" — step
- "Commit" — step

## Requirements

- **Exact file paths always** — use the path alias `@/` for imports
- **Complete code in plan** — not "add validation" but the actual code
- **Exact commands with expected output**
- **Testing per CLAUDE.md**: unit tests for utilities, E2E for UI features, regression tests for bug fixes
- **Analytics per CLAUDE.md**: `track()` on interactive elements with `[section]_[action]` naming
- **DRY, YAGNI, TDD, frequent commits**
- **Commits should be atomic** — one logical change per commit, with a clear short 1 line description.

## Step 5: Review

After writing the plan, review it yourself:

- Does every task produce a working, testable increment?
- Are file paths real (verified by reading the codebase)?
- Does the plan follow conventions from CLAUDE.md and docs/?
- Are tests included for every task?

Present the plan to the user for feedback before any implementation begins.

_Adapted from [obra/superpowers](https://github.com/obra/superpowers) writing-plans skill._
