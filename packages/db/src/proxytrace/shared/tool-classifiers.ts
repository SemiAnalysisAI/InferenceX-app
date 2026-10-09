// Write-time classifiers for tool-analytics. These run once at ingest
// (extractRequestStats calls them) and their outputs are stored in
// `request_stats`, so the dashboard queries never have to ship the raw
// command / content blobs to classify at read time.
//
// Keep in rough parity with the SQL ports in
// packages/db/migrations/017_classify_stats.ts — both need to produce
// equivalent results for a given input.

export type VerificationKind = 'test' | 'typecheck' | 'lint' | 'build' | 'other';
export type VerificationStatus = 'pass' | 'fail' | 'unknown';

export function classifyCommand(command: string | null | undefined): VerificationKind | null {
  if (!command) return null;
  const c = command.toLowerCase().replaceAll(/\s+/gu, ' ').trim();

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::[\w:-]+)?|e2e)\b/u.test(c) ||
    /\b(?:vitest|jest|pytest|rspec|phpunit|ctest|mocha|ava|tox|nox|nose2|busted|behat|codeception)\b/u.test(
      c,
    ) ||
    /\bplaywright\s+test\b/u.test(c) ||
    /\bcypress\s+run\b/u.test(c) ||
    /\b(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+tap\b/u.test(c) ||
    /\bnode\s+--test\b/u.test(c) ||
    /\bpython(?:\d+(?:\.\d+)*)?\s+-m\s+unittest\b/u.test(c) ||
    /\bgo\s+test\b/u.test(c) ||
    /\bcargo\s+(?:test|nextest\s+run)\b/u.test(c) ||
    /\b(?:mvn|mvnw)\b[^;&|\r\n]{0,500}\btest\b/u.test(c) ||
    /\b(?:gradle|gradlew)\b[^;&|\r\n]{0,1000}\s(?::[\w.-]+:)?test\b/u.test(c) ||
    /\bdotnet\s+test\b/u.test(c) ||
    /\bdeno\s+test\b/u.test(c) ||
    /\b(?:mix|swift|bazel|buck2|just)\s+test\b/u.test(c) ||
    /\bmake\s+(?:test|check)\b/u.test(c) ||
    /\brake\s+(?:test|spec)\b/u.test(c) ||
    /\bzig\s+build\s+test\b/u.test(c) ||
    /\bmeson\s+test\b/u.test(c) ||
    /\bxcodebuild\b[^;&|\r\n]{0,1000}\btest\b/u.test(c)
  ) {
    return 'test';
  }

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?typecheck\b/u.test(c) ||
    /\b(?:tsc|vue-tsc|svelte-check|pyright|basedpyright|mypy|pyre|pytype)\b/u.test(c) ||
    /\bcargo\s+check\b/u.test(c) ||
    /\bgo\s+vet\b/u.test(c) ||
    /\bflow\s+(?:check|status)\b/u.test(c) ||
    /\bsrb\s+tc\b/u.test(c) ||
    /\bsteep\s+check\b/u.test(c) ||
    /\bjust\s+check\b/u.test(c)
  ) {
    return 'typecheck';
  }

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:lint|check(?::[\w:-]+)?|format:check)\b/u.test(c) ||
    /\b(?:eslint|oxlint|ruff|flake8|pylint|clippy|golangci-lint|shellcheck|stylelint|rubocop|standardrb|hadolint|markdownlint|markdownlint-cli2|yamllint|vale|actionlint|zizmor|semgrep|staticcheck|swiftlint|ktlint|detekt|tflint|checkov)\b/u.test(
      c,
    ) ||
    /\bcargo\s+clippy\b/u.test(c) ||
    /\bcargo\s+fmt\b[^;&|\r\n]{0,1000}\s--check\b/u.test(c) ||
    /\bbiome\s+check\b/u.test(c) ||
    /\b(?:prettier|black)\b[^;&|\r\n]{0,2000}\s--check\b/u.test(c) ||
    /\b(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+standard\b/u.test(c) ||
    /\bisort\b[^;&|\r\n]{0,2000}\s--check(?:-only)?\b/u.test(c) ||
    /\bdprint\s+check\b/u.test(c) ||
    /\bsqlfluff\s+lint\b/u.test(c) ||
    /\bgitleaks\s+(?:detect|protect)\b/u.test(c) ||
    /\brustfmt\b[^;&|\r\n]{0,2000}\s--check\b/u.test(c) ||
    /\bshfmt\b[^;&|\r\n]{0,2000}\s(?:-d|--diff)\b/u.test(c) ||
    /\bterraform\s+(?:validate|fmt\b[^;&|\r\n]{0,1000}\s-check\b)/u.test(c) ||
    /\bdeno\s+(?:lint|fmt\b[^;&|\r\n]{0,1000}\s--check\b)/u.test(c) ||
    /\bpre-commit\s+run\b/u.test(c)
  ) {
    return 'lint';
  }

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|verify)\b/u.test(c) ||
    /\b(?:next|vite|astro)\s+build\b/u.test(c) ||
    /\bturbo\s+(?:run\s+)?build\b/u.test(c) ||
    /\b(?:nx|rush|bazel|buck2)\s+build\b/u.test(c) ||
    /\blerna\s+(?:run\s+)?build\b/u.test(c) ||
    /\bcargo\s+build\b/u.test(c) ||
    /\bgo\s+build\b/u.test(c) ||
    /\bmake\s+(?:build|all)\b/u.test(c) ||
    /\b(?:gradle|gradlew)\b[^;&|\r\n]{0,1000}\s(?:build|assemble)\b/u.test(c) ||
    /\b(?:mvn|mvnw)\b[^;&|\r\n]{0,500}\b(?:package|verify|install)\b/u.test(c) ||
    /\bdotnet\s+(?:build|publish)\b/u.test(c) ||
    /\bswift\s+build\b/u.test(c) ||
    /\bmix\s+compile\b/u.test(c) ||
    /\bxcodebuild\b[^;&|\r\n]{0,1000}\b(?:build|archive)\b/u.test(c) ||
    /\bzig\s+build\b/u.test(c) ||
    /\bmeson\s+compile\b/u.test(c) ||
    /\b(?:webpack|rollup|esbuild|ninja)\b/u.test(c) ||
    /\b(?:docker|podman)\s+(?:build|buildx\s+build)\b/u.test(c) ||
    /\b(?:poetry|maturin)\s+build\b/u.test(c) ||
    /\bcmake\s+--build\b/u.test(c) ||
    /\btsc\s+(?:--build|-b)\b/u.test(c)
  ) {
    return 'build';
  }

  return 'other';
}

// Digit repetitions are bounded (`\d{0,9}` / `\d{1,9}`) to prevent polynomial
// backtracking on long runs of digits — content can be up to 8KB of arbitrary
// tool output. 10 digits covers any realistic test/error count.

const FAIL_PATTERNS = [
  /[1-9]\d{0,9} (?:tests? )?failed\b/u,
  /\bfailed tests?\b/u,
  /\btest suite failed\b/u,
  /\bfailures?\b/u,
  /\bassertionerror\b/u,
  /\berror ts\d{1,9}\b/u,
  /\bcommand failed\b/u,
  /\bexit code [1-9]\d{0,9}\b/u,
  /\bnpm err!\b/u,
  /\belifecycle\b/u,
  /\btraceback \(most recent call last\)/u,
  /\bsegmentation fault\b/u,
  /\bpanic:/u,
  /\bfound [1-9]\d{0,9} errors?\b/u,
  /[1-9]\d{0,9} errors?\b/u,
];

const PASS_PATTERNS = [
  /\ball tests passed\b/u,
  /\btests? passed\b/u,
  /\b[1-9]\d{0,9} passed\b/u,
  /\b0 failed\b/u,
  /\b0 errors?\b/u,
  /\bcompiled successfully\b/u,
  /\bno errors? found\b/u,
  /\bno issues found\b/u,
  /\bbuild succeeded\b/u,
  /\bsuccessfully\b/u,
];

export function classifyResult(
  isError: boolean | null | undefined,
  content: string | null | undefined,
): VerificationStatus {
  if (isError === true) return 'fail';

  const text = (content ?? '').toLowerCase();
  if (text) {
    for (const pattern of FAIL_PATTERNS) {
      if (pattern.test(text)) return 'fail';
    }
    for (const pattern of PASS_PATTERNS) {
      if (pattern.test(text)) return 'pass';
    }
  }

  if (isError === false) return 'pass';
  return 'unknown';
}

// ── Command binary extraction ──
//
// extractCommandBinaries records every program name that sits at a command
// position in a (possibly compound) shell command: pipeline stages, &&/||/;
// chains, subshells, command substitutions, and a small set of wrappers
// (`sudo rm` → [sudo, rm]). Occurrences are kept in order, not deduped.
//
// Privacy: only program names survive — the scanner is quote- and
// heredoc-aware precisely so that argument content (`grep 'a|b'`) and
// heredoc bodies (`cat <<'EOF' …`) are never mistaken for commands. This is
// a lexical scan, not shell evaluation; exotic syntax degrades to missing
// entries, never to leaked arguments.
//
// The only SQL port is migration 029's pg_temp.extract_binary, which mirrors
// the LEGACY single-token extractor for backfilled rows. command_binaries has
// no SQL port: legacy rows keep their single `command_binary` and the
// tool-timings query falls back to it — re-extraction is impossible for anon
// traces anyway (bodies are stripped at ingest).

// Program names that wrap another command; after recording one, flags, env
// assignments, and bare durations (`timeout 30`, `nice -n 5`) pass through
// so the wrapped binary is recorded too.
const COMMAND_WRAPPERS = new Set([
  'sudo',
  'doas',
  'env',
  'nohup',
  'nice',
  'stdbuf',
  'timeout',
  'time',
  'command',
  'exec',
  'xargs',
  'setsid',
  'caffeinate',
]);

// Wrapper flags that take a separate value (`sudo -u user`, `timeout -s KILL`,
// `xargs -I {}`) — skip the value so it is never mistaken for the command.
// Keyed per wrapper: flag namespaces differ (`-s` takes a value for timeout
// but is valueless for sudo, where eating the next word would drop the real
// command).
const WRAPPER_VALUE_FLAGS: Record<string, ReadonlySet<string> | undefined> = {
  sudo: new Set(['-u', '-g', '-p', '-h', '-C', '-D', '-R', '-T']),
  doas: new Set(['-u', '-C']),
  timeout: new Set(['-s', '-k']),
  nice: new Set(['-n']),
  xargs: new Set(['-I', '-a', '-d', '-E', '-L', '-n', '-P', '-s']),
  env: new Set(['-u', '-C', '-S']),
};

// Reserved words that precede a command in the same segment (`if cmd`).
const KEYWORDS_BEFORE_COMMAND = new Set([
  'if',
  'then',
  'elif',
  'else',
  'while',
  'until',
  'do',
  '!',
  '{',
]);

// Reserved words whose following tokens are names/patterns, not commands
// (`for f in …`, `case $x in …`).
const KEYWORDS_CONSUME_COMMAND = new Set([
  'for',
  'case',
  'select',
  'function',
  'in',
  'fi',
  'done',
  'esac',
  '}',
  '[[',
  ']]',
  'break',
  'continue',
  'return',
]);

// Bash assignments may target an indexed/associative array element. Treat the
// whole LHS as assignment syntax so values such as URLs and regexes never get
// re-armed as commands by an `&` / `|` inside the value.
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\r\n]*\])?\+?=/u;
const WRAPPER_DURATION_RE = /^\d+(?:\.\d+)?[smhd]?$/u;
const NUMERIC_RE = /^\d+(?:\.\d+)*$/u;
const ALNUM_RE = /[A-Za-z0-9]/u;
const WHITESPACE_RE = /\s/u;
const LAUNCHER_EXT_RE = /\.(?:exe|cmd|bat|com)$/iu;
const CONTENT_SYNTAX_RE = /[[\]${}|&;<>()<>"'?,=]/u;
const WORDLIKE_RE = /[\p{L}\p{N}_]/u;
const ASCII_PROGRAM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/u;
const VERSIONED_PROGRAM_RE = /\.\d+(?:\.\d+)*$/u;
const SINGLE_LETTER_RE = /^[A-Za-z]$/u;
const NUMERIC_PREFIX_PROGRAMS = new Set(['2to3', '7z']);
const HASH_FRAGMENT_RE = /^[0-9a-f]{8,}$/u;
const UPPERCASE_IDENTIFIER_RE = /^[A-Z]{1,3}\d+$/u;
// Uppercase and underscore-heavy tokens found in command position are usually
// embedded source identifiers or same-command helper functions, not spawned
// programs. Keep the precision contract explicit: rare real executables with
// these shapes must be named here instead of allowing an open-ended class.
const CASE_SENSITIVE_PROGRAMS = new Set(['PowerShell', 'Tailscale', 'Xvfb']);
const UNDERSCORED_PROGRAMS = new Set([
  'memory_pressure',
  'pg_basebackup',
  'pg_ctl',
  'pg_dump',
  'pg_isready',
  'pg_receivewal',
  'pg_recvlogical',
  'pg_resetwal',
  'pg_restore',
  'pg_rewind',
  'pg_test_fsync',
  'pg_test_timing',
  'pg_upgrade',
  'pg_verifybackup',
  'sw_vers',
  'system_profiler',
  'vm_stat',
  'x86_64-w64-mingw32-gcc',
]);
// Repeated local shell helpers observed in production compound commands. They
// are exact names (not a word-shape heuristic) so genuine standard/custom
// executables remain collectable. New same-command function tracking prevents
// most of these at ingest; this set also protects analytics for legacy anon
// rows whose raw command was intentionally discarded.
const KNOWN_SHELL_HELPER_ARTIFACTS = new Set([
  'apsearch',
  'bfetch',
  'bing',
  'bingurls',
  'casesearch',
  'check',
  'chk',
  'copy',
  'count',
  'custsearch',
  'ddg',
  'ddgl',
  'dl',
  'dl2',
  'dl3',
  'dlx',
  'dnsearch',
  'doesearch',
  'enc',
  'esearch',
  'fetch',
  'fetch15g',
  'gasearch',
  'geo',
  'get',
  'getq',
  'grab',
  'lg',
  'mk',
  'owner',
  'page',
  'parse',
  'post',
  'probe',
  'qfetch',
  'query',
  'render',
  'reply',
  'row',
  'run',
  'run2',
  'run3',
  'runf',
  'runp',
  'runq',
  'runv',
  'scan',
  'search',
  'sfetch',
  'sha',
  'show',
  'srch',
  'sweep',
  'sweep2',
  'sweep3',
  'sweep4',
  'tabs',
  'tabs2',
  'vsearch',
  'wb',
]);
const KNOWN_CONTENT_ARTIFACTS = new Set([
  'APAC',
  'APPENDED',
  'COMBINE_REL_TOL',
  'CollectiveX',
  'DECAP',
  'DO-NOT-SUM',
  'Desktop',
  'ELECTRONICS',
  'Format-Table',
  'Get-ChildItem',
  'Get-Item',
  'Google',
  'InferenceX',
  'InferenceX-Private',
  'Model',
  'OneDrive',
  'Out-File',
  'Out-Null',
  'POST',
  'Pirkey_Power_Plant',
  'Pomodoro',
  'Read',
  'RULES',
  'SA',
  'Scripts',
  'Select-Object',
  'Signal',
  'Skanska',
  'Sort-Object',
  'TABS2026017750',
  'TaskStop',
  'Uncaught',
  'Unhandled',
  'Withdrawn',
  'XDUP',
  'about',
  'api',
  'before',
  'b1xbmuoln',
  'bf16',
  'blob',
  'break',
  'bsbyitota',
  'build',
  'cine',
  'collectivex',
  'continue',
  'csv',
  'current',
  'data',
  'db',
  'def',
  'developer',
  'error',
  'except',
  'fetchU',
  'frontend',
  'gsm8k',
  'hays',
  'hays2',
  'for',
  'if',
  'is',
  'kineto',
  'mixed',
  'mostly',
  'new',
  'notes',
  'null',
  'other',
  'pool',
  'profiler',
  'quote',
  'request',
  'return',
  'rows',
  'site-packages',
  'structures',
  'store',
  'title',
  'topk-slot-tree-sum',
  'tool-results',
  'try',
  'unknown',
  'until',
  'utilities',
  'utility',
  'utilit',
  'via',
  'while',
  'workflows',
  'working',
]);
const HEREDOC_DELIM_END_RE = /[\s;|&()<>`]/u;
const LEADING_TABS_RE = /^\t+/u;

const MAX_BINARIES = 32;
const MAX_BINARY_LENGTH = 32;
// Bound worst-case per-char scanning; command-position binaries live at the
// front of command text, and truncation can only miss entries, never leak.
const MAX_SCAN_LENGTH = 262144;

// Shared with analytics so historical rows produced by older extractors are
// held to the same precision contract as newly ingested commands.
export function isPlausibleCommandBinaryName(name: string): boolean {
  if (name === '[') return true;
  if (
    name.length >= MAX_BINARY_LENGTH ||
    !ASCII_PROGRAM_NAME_RE.test(name) ||
    SINGLE_LETTER_RE.test(name) ||
    name.startsWith('_') ||
    name.endsWith('-') ||
    name.endsWith('_') ||
    name.endsWith('.') ||
    name.includes('__') ||
    name.includes('--') ||
    (/^\d/u.test(name) && !NUMERIC_PREFIX_PROGRAMS.has(name)) ||
    HASH_FRAGMENT_RE.test(name) ||
    UPPERCASE_IDENTIFIER_RE.test(name) ||
    (/[A-Z]/u.test(name) && !CASE_SENSITIVE_PROGRAMS.has(name)) ||
    (name.includes('_') && !UNDERSCORED_PROGRAMS.has(name)) ||
    KNOWN_SHELL_HELPER_ARTIFACTS.has(name) ||
    KNOWN_CONTENT_ARTIFACTS.has(name)
  ) {
    return false;
  }
  // Dots in an executable name are overwhelmingly file/content suffixes.
  // Preserve versioned launchers such as python3.12; Windows launcher
  // suffixes are normalized before this check for newly collected rows.
  return !name.includes('.') || VERSIONED_PROGRAM_RE.test(name);
}

// Verification tools can sit behind runners (`uv run pytest`, `python -m
// pytest`, `npx eslint`) and therefore never occupy a shell command position.
// These fixed patterns are safe to retain as additional binary hints: only the
// canonical names below survive, never surrounding arguments or content.
const binaryNamePattern = (binary: string): RegExp =>
  new RegExp(`(?<![\\w-])${binary}(?![\\w-])`, 'iu');

const ADDITIONAL_BINARY_WHITELIST: readonly { binary: string; pattern: RegExp }[] = [
  {
    binary: 'npm',
    pattern:
      /\bnpm\s+(?:run\s+)?(?:test(?::[\w:-]+)?|typecheck|lint|build|check(?::[\w:-]+)?|verify|e2e|format(?::check)?)\b/iu,
  },
  {
    binary: 'pnpm',
    pattern:
      /\bpnpm\s+(?:run\s+)?(?:test(?::[\w:-]+)?|typecheck|lint|build|check(?::[\w:-]+)?|verify|e2e|format(?::check)?)\b/iu,
  },
  {
    binary: 'yarn',
    pattern:
      /\byarn\s+(?:run\s+)?(?:test(?::[\w:-]+)?|typecheck|lint|build|check(?::[\w:-]+)?|verify|e2e|format(?::check)?)\b/iu,
  },
  {
    binary: 'bun',
    pattern:
      /\bbun\s+(?:run\s+)?(?:test(?::[\w:-]+)?|typecheck|lint|build|check(?::[\w:-]+)?|verify|e2e|format(?::check)?)\b/iu,
  },
  ...[
    'vitest',
    'jest',
    'pytest',
    'rspec',
    'phpunit',
    'ctest',
    'mocha',
    'ava',
    'tox',
    'nox',
    'nose2',
    'busted',
    'behat',
    'codeception',
  ].map((binary) => ({ binary, pattern: binaryNamePattern(binary) })),
  { binary: 'playwright', pattern: /\bplaywright\s+test\b/iu },
  { binary: 'cypress', pattern: /\bcypress\s+run\b/iu },
  {
    binary: 'tap',
    pattern: /\b(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+tap\b/iu,
  },
  { binary: 'node', pattern: /\bnode\s+--test\b/iu },
  { binary: 'python', pattern: /\bpython\s+-m\s+unittest\b/iu },
  { binary: 'python3', pattern: /\bpython3(?:\.\d+)?\s+-m\s+unittest\b/iu },
  { binary: 'coverage', pattern: /\bcoverage\s+run\b/iu },
  { binary: 'go', pattern: /\bgo\s+(?:test|build)\b/iu },
  {
    binary: 'cargo',
    pattern: /\bcargo\s+(?:test|nextest\s+run|check|clippy|fmt|build)\b/iu,
  },
  { binary: 'mvn', pattern: /\bmvn\b[^;&|\r\n]{0,500}\b(?:test|package|verify|install)\b/iu },
  {
    binary: 'mvnw',
    pattern: /\bmvnw\b[^;&|\r\n]{0,500}\b(?:test|package|verify|install)\b/iu,
  },
  {
    binary: 'gradle',
    pattern: /\bgradle\b[^;&|\r\n]{0,1000}\s(?:(?::[\w.-]+:)?test|build|assemble)\b/iu,
  },
  {
    binary: 'gradlew',
    pattern: /\bgradlew\b[^;&|\r\n]{0,1000}\s(?:(?::[\w.-]+:)?test|build|assemble)\b/iu,
  },
  { binary: 'dotnet', pattern: /\bdotnet\s+(?:test|build|publish)\b/iu },
  { binary: 'deno', pattern: /\bdeno\s+(?:test|lint|fmt)\b/iu },
  { binary: 'mix', pattern: /\bmix\s+(?:test|compile)\b/iu },
  { binary: 'swift', pattern: /\bswift\s+(?:test|build)\b/iu },
  { binary: 'xcodebuild', pattern: /\bxcodebuild\b[^;&|\r\n]{0,1000}\b(?:test|build|archive)\b/iu },
  { binary: 'bazel', pattern: /\bbazel\s+(?:test|build)\b/iu },
  { binary: 'buck2', pattern: /\bbuck2\s+(?:test|build)\b/iu },
  { binary: 'just', pattern: /\bjust\s+(?:test|check|lint|build)\b/iu },
  { binary: 'make', pattern: /\bmake\s+(?:test|check|lint|build|all)\b/iu },
  { binary: 'meson', pattern: /\bmeson\s+(?:test|compile)\b/iu },
  { binary: 'zig', pattern: /\bzig\s+build\b/iu },
  { binary: 'rake', pattern: /\brake\s+(?:test|spec)\b/iu },
  ...[
    'tsc',
    'vue-tsc',
    'svelte-check',
    'pyright',
    'basedpyright',
    'mypy',
    'pyre',
    'pytype',
    'eslint',
    'oxlint',
    'ruff',
    'flake8',
    'pylint',
    'clippy',
    'golangci-lint',
    'shellcheck',
    'stylelint',
    'rubocop',
    'standardrb',
    'hadolint',
    'markdownlint',
    'markdownlint-cli2',
    'yamllint',
    'vale',
    'actionlint',
    'zizmor',
    'semgrep',
    'staticcheck',
    'swiftlint',
    'ktlint',
    'detekt',
    'tflint',
    'checkov',
  ].map((binary) => ({
    binary,
    pattern: binaryNamePattern(binary),
  })),
  { binary: 'srb', pattern: /\bsrb\s+tc\b/iu },
  { binary: 'steep', pattern: /\bsteep\s+check\b/iu },
  { binary: 'flow', pattern: /\bflow\s+(?:check|status)\b/iu },
  {
    binary: 'standard',
    pattern: /\b(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+standard\b/iu,
  },
  { binary: 'biome', pattern: /\bbiome\s+check\b/iu },
  { binary: 'prettier', pattern: /\bprettier\b[^;&|\r\n]{0,2000}\s--check\b/iu },
  { binary: 'black', pattern: /\bblack\b[^;&|\r\n]{0,2000}\s--check\b/iu },
  { binary: 'isort', pattern: /\bisort\b[^;&|\r\n]{0,2000}\s--check(?:-only)?\b/iu },
  { binary: 'dprint', pattern: /\bdprint\s+check\b/iu },
  { binary: 'sqlfluff', pattern: /\bsqlfluff\s+lint\b/iu },
  { binary: 'gitleaks', pattern: /\bgitleaks\s+(?:detect|protect)\b/iu },
  { binary: 'rustfmt', pattern: /\brustfmt\b[^;&|\r\n]{0,2000}\s--check\b/iu },
  { binary: 'shfmt', pattern: /\bshfmt\b[^;&|\r\n]{0,2000}\s(?:-d|--diff)\b/iu },
  { binary: 'pre-commit', pattern: /\bpre-commit\s+run\b/iu },
  { binary: 'terraform', pattern: /\bterraform\s+(?:validate|fmt)\b/iu },
  ...['next', 'vite', 'astro'].map((binary) => ({
    binary,
    pattern: new RegExp(`(?<![\\w-])${binary}\\s+build\\b`, 'iu'),
  })),
  { binary: 'turbo', pattern: /\bturbo\s+(?:run\s+)?build\b/iu },
  { binary: 'nx', pattern: /\bnx\s+build\b/iu },
  { binary: 'lerna', pattern: /\blerna\s+(?:run\s+)?build\b/iu },
  { binary: 'rush', pattern: /\brush\s+build\b/iu },
  {
    binary: 'webpack',
    pattern:
      /\b(?:(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+webpack|webpack\s+(?:--config|-c|--mode))\b/iu,
  },
  {
    binary: 'rollup',
    pattern:
      /\b(?:(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+rollup|rollup\s+(?:--config|-c))\b/iu,
  },
  {
    binary: 'esbuild',
    pattern:
      /\b(?:(?:npx|bunx|pnpm\s+exec|yarn\s+(?:dlx|exec))\s+esbuild|esbuild\b[^;&|\r\n]{0,1000}\s--bundle)\b/iu,
  },
  { binary: 'ninja', pattern: /\bninja\s+(?:-C|-f|-j|all|install|test)\b/iu },
  { binary: 'docker', pattern: /\bdocker\s+(?:build|buildx\s+build)\b/iu },
  { binary: 'podman', pattern: /\bpodman\s+build\b/iu },
  { binary: 'poetry', pattern: /\bpoetry\s+build\b/iu },
  { binary: 'maturin', pattern: /\bmaturin\s+build\b/iu },
  { binary: 'cmake', pattern: /\bcmake\s+--build\b/iu },
];

export function extractAdditionalBinaries(
  command: string | null | undefined,
  commandBinaries: readonly string[],
): string[] {
  if (!command || commandBinaries.length >= MAX_BINARIES) return [];
  const src = command.length > MAX_SCAN_LENGTH ? command.slice(0, MAX_SCAN_LENGTH) : command;
  const seen = new Set(commandBinaries.map((binary) => binary.toLowerCase()));
  const additional: string[] = [];
  for (const rule of ADDITIONAL_BINARY_WHITELIST) {
    if (rule.pattern.test(src) && !seen.has(rule.binary)) {
      additional.push(rule.binary);
      seen.add(rule.binary);
      if (commandBinaries.length + additional.length >= MAX_BINARIES) break;
    }
  }
  return additional;
}

interface SubstFrame {
  kind: 'subst' | 'backtick';
  depth: number;
  word: string;
  atCmd: boolean;
  wrapper: boolean;
  wrapperName: string;
  skipWord: boolean;
  caseLevel: number;
  inCasePattern: boolean;
  inTest: boolean;
  inLoopHeader: boolean;
  wordDynamic: boolean;
}
interface QuoteFrame {
  kind: 'dquote';
}
type ScanFrame = SubstFrame | QuoteFrame;

export function extractCommandBinaries(command: string | null | undefined): string[] {
  if (!command) return [];
  const src = command.length > MAX_SCAN_LENGTH ? command.slice(0, MAX_SCAN_LENGTH) : command;
  const n = src.length;
  const out: string[] = [];

  const stack: ScanFrame[] = [];
  let i = 0;
  let word = '';
  let atCmd = true; // next word sits at a command position
  let wrapper = false; // last recorded word was a known wrapper
  let wrapperName = ''; // which wrapper — selects its value-taking flags
  let skipWord = false; // next word is a redirect target / flag value — discard
  let caseLevel = 0; // open `case … esac` blocks — `)` closes a pattern there
  let inCasePattern = false; // between `case`/`;;` and `)` — tokens are patterns
  let inTest = false; // inside `[[ … ]]` — &&/|| are operators, not separators
  let inLoopHeader = false; // between `for`/`select` and the matching `do`
  let wordDynamic = false; // command name contains an expansion, so its runtime name is unknown
  let expectFunctionName = false; // `function name { ... }` declaration syntax
  const definedFunctions = new Set<string>();
  let pendingHeredocs: { delim: string; stripTabs: boolean }[] = [];

  // Inside `[[ … ]]` or a case pattern list, separators (`|`, `(`, newline)
  // are pattern/operator syntax — they must not re-arm command position.
  const inOperandContext = (): boolean => inTest || (caseLevel > 0 && inCasePattern);

  const toBinaryName = (token: string): string => {
    // Both separators: Unix paths and (quoted) Windows paths.
    const cut = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'));
    let base = cut === -1 ? token : token.slice(cut + 1);
    // Strip Windows launcher extensions so git.exe / pnpm.cmd aggregate with
    // their Unix spellings. Script/data suffixes are rejected by the shared
    // precision gate below.
    const hasWindowsLauncherExtension = LAUNCHER_EXT_RE.test(base);
    base = base.replace(LAUNCHER_EXT_RE, '');
    // Windows command lookup is case-insensitive. Canonicalize names when an
    // explicit launcher suffix proves Windows executable syntax; otherwise
    // uppercase tokens remain subject to the source-identifier precision gate.
    if (hasWindowsLauncherExtension) base = base.toLowerCase();
    // A name at the privacy cap is indistinguishable from truncated prose,
    // file names, and content slugs. Drop it instead of manufacturing a
    // plausible-looking 32-character program name.
    if (base.length >= MAX_BINARY_LENGTH) return '';
    return base;
  };

  const dropCmd = (): void => {
    atCmd = false;
    wrapper = false;
    wrapperName = '';
  };

  // Classify + consume the finished word buffer. `beforeRedirect` marks a
  // word terminated by an unquoted `<`/`>` so fd numbers (`2>`) are not
  // mistaken for commands.
  const endWord = (beforeRedirect = false): void => {
    const token = word;
    word = '';
    const dynamic = wordDynamic;
    wordDynamic = false;
    if (!token) {
      if (dynamic && (atCmd || wrapper)) dropCmd();
      return;
    }
    if (beforeRedirect && NUMERIC_RE.test(token)) return;
    if (skipWord) {
      skipWord = false;
      return;
    }
    // Block closers matter regardless of command position — `esac` usually
    // arrives right after `;;` (not at command position).
    if (token === 'esac') {
      caseLevel = Math.max(0, caseLevel - 1);
      inCasePattern = false; // back in the enclosing branch body
      atCmd = false;
      return;
    }
    if (token === ']]') {
      inTest = false;
      atCmd = false;
      return;
    }
    if (inLoopHeader && token === 'do') {
      inLoopHeader = false;
      atCmd = true;
      wrapper = false;
      wrapperName = '';
      skipWord = false;
      return;
    }
    if (expectFunctionName) {
      expectFunctionName = false;
      const name = toBinaryName(token);
      if (name) definedFunctions.add(name);
      // The declaration body (`{ ...; }` or a compound command) follows.
      atCmd = true;
      wrapper = false;
      wrapperName = '';
      return;
    }
    if (!atCmd && !wrapper) return;
    if (wrapper) {
      if (WRAPPER_VALUE_FLAGS[wrapperName]?.has(token)) {
        skipWord = true; // the flag's value (`sudo -u user`), not the command
        return;
      }
      // Flags, bare durations (`timeout 30`), and placeholder tokens
      // (`xargs -I {}`) pass through to the wrapped command.
      if (token.startsWith('-') || WRAPPER_DURATION_RE.test(token) || !ALNUM_RE.test(token)) return;
    }
    if (ASSIGNMENT_RE.test(token)) return; // FOO=bar prefix — stay at command position
    if (dynamic) {
      // `$TOOL`, `prefix${SUFFIX}`, and `prefix$(resolver)` do invoke a
      // runtime-resolved command, but there is no concrete binary name safe
      // to attribute statically. Do not retain the variable/content fragment.
      dropCmd();
      return;
    }
    if (!wrapper) {
      if (KEYWORDS_BEFORE_COMMAND.has(token)) return;
      if (KEYWORDS_CONSUME_COMMAND.has(token)) {
        if (token === 'case') {
          caseLevel++;
          inCasePattern = true;
        } else if (token === '[[') inTest = true;
        else if (token === 'for' || token === 'select') inLoopHeader = true;
        else if (token === 'function') expectFunctionName = true;
        atCmd = false;
        return;
      }
    }
    if (token.startsWith('$') || token.startsWith('-') || NUMERIC_RE.test(token)) {
      // Dynamic ($VAR), flag-like, or numeric tokens are not binary names.
      dropCmd();
      return;
    }
    const name = toBinaryName(token);
    if (
      !name ||
      WHITESPACE_RE.test(name) ||
      (name !== '[' &&
        (CONTENT_SYNTAX_RE.test(name) ||
          !WORDLIKE_RE.test(name) ||
          name.endsWith(':') ||
          !isPlausibleCommandBinaryName(name)))
    ) {
      // Multi-word literals and unmistakable shell/content fragments are not
      // program names. `[` is retained because it is a real test command.
      dropCmd();
      return;
    }
    if (definedFunctions.has(name)) {
      // Functions declared inside this Bash tool call do not launch a
      // program when invoked later in the same compound command.
      dropCmd();
      return;
    }
    if (out.length < MAX_BINARIES) out.push(name);
    atCmd = false;
    wrapper = COMMAND_WRAPPERS.has(name);
    wrapperName = wrapper ? name : '';
  };

  const resetCmd = (): void => {
    atCmd = true;
    wrapper = false;
    wrapperName = '';
    skipWord = false;
    wordDynamic = false;
  };

  const pushSubst = (kind: 'subst' | 'backtick'): void => {
    stack.push({
      kind,
      depth: 1,
      word,
      atCmd,
      wrapper,
      wrapperName,
      skipWord,
      caseLevel,
      inCasePattern,
      inTest,
      inLoopHeader,
      wordDynamic,
    });
    word = '';
    wordDynamic = false;
    caseLevel = 0;
    inCasePattern = false;
    inTest = false;
    inLoopHeader = false;
    resetCmd();
  };

  const popSubst = (): void => {
    endWord();
    const frame = stack.pop();
    if (frame && frame.kind !== 'dquote') {
      ({
        word,
        atCmd,
        wrapper,
        wrapperName,
        skipWord,
        caseLevel,
        inCasePattern,
        inTest,
        inLoopHeader,
        wordDynamic,
      } = frame);
      if (atCmd || wrapper) {
        if (word) {
          // A substitution embedded in a command word makes the final binary
          // name dynamic (`prefix$(resolver)`). Keep the inner command only.
          wordDynamic = true;
        } else {
          // The substitution's dynamic output fills the whole command (or
          // wrapped-command) slot — whatever follows is its argument.
          dropCmd();
        }
      }
    }
  };

  // Skip a quote-aware (…) group — array assignment literals and `((…))`
  // arithmetic (paren-counting, so nested parens don't cut the skip short).
  // `from` points at the opening paren; returns the index past the matching
  // close.
  const skipParenGroup = (from: number): number => {
    let depth = 0;
    let j = from;
    while (j < n) {
      const c = src[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === "'") {
        const close = src.indexOf("'", j + 1);
        j = close === -1 ? n : close + 1;
        continue;
      }
      if (c === '"') {
        j++;
        while (j < n && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
        j++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return j + 1;
      }
      j++;
    }
    return n;
  };

  // Skip `${…}` as one opaque word component. Operators and patterns inside
  // parameter expansion (`${value%%|*}`) are data, not pipeline/control
  // syntax. Unterminated expansion consumes the remainder, the privacy-safe
  // failure mode. Nested `${…}` is supported; nested command substitutions
  // are deliberately not extracted because their boundaries are ambiguous in
  // this lightweight scanner.
  const skipParameterExpansion = (from: number): number => {
    let depth = 0;
    let quote: "'" | '"' | null = null;
    let j = from;
    while (j < n) {
      const c = src[j]!;
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (quote) {
        if (c === quote) quote = null;
        j++;
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        j++;
        continue;
      }
      if (c === '$' && src[j + 1] === '{') {
        depth++;
        j += 2;
        continue;
      }
      if (c === '}') {
        depth--;
        j++;
        if (depth === 0) return j;
        continue;
      }
      j++;
    }
    return n;
  };

  // `$'…'` is Bash ANSI-C quoting. Unlike an ordinary single-quoted string,
  // an escaped quote (`\'`) does not end it. Skipping it atomically prevents
  // embedded source code and regex literals from being scanned as commands.
  const skipAnsiCQuote = (from: number): number => {
    let j = from + 2;
    while (j < n) {
      if (src[j] === '\\') {
        j += 2;
        continue;
      }
      if (src[j] === "'") return j + 1;
      j++;
    }
    return n;
  };

  // `$(` at src[i]: `$((…))` arithmetic (no commands — skip it) or a command
  // substitution (open a frame). Shared by the double-quote and normal
  // contexts so their behavior can't drift.
  const openDollarParen = (): void => {
    if (src[i + 2] === '(') {
      if (atCmd || wrapper) wordDynamic = true;
      i = skipParenGroup(i + 1);
    } else {
      i += 2;
      pushSubst('subst');
    }
  };

  // i points just past `<<`. Read the (quote-stripped) delimiter word; the
  // body is consumed at the next unquoted newline.
  const readHeredocDelim = (): void => {
    let stripTabs = false;
    if (src[i] === '-') {
      stripTabs = true;
      i++;
    }
    while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
    let delim = '';
    while (i < n && !HEREDOC_DELIM_END_RE.test(src[i]!)) {
      delim += src[i];
      i++;
    }
    delim = delim.replaceAll(/["'\\]/gu, '');
    if (delim) pendingHeredocs.push({ delim, stripTabs });
  };

  // Skip heredoc bodies line-by-line until each pending delimiter line.
  // Unterminated heredocs consume the rest of the command — the safe
  // direction, since bodies are file content, not commands.
  const consumeHeredocs = (from: number): number => {
    let idx = from;
    for (const doc of pendingHeredocs) {
      while (idx < n) {
        let lineEnd = src.indexOf('\n', idx);
        if (lineEnd === -1) lineEnd = n;
        let line = src.slice(idx, lineEnd);
        idx = lineEnd + 1;
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (doc.stripTabs) line = line.replace(LEADING_TABS_RE, '');
        if (line === doc.delim) break;
      }
    }
    return Math.min(idx, n);
  };

  while (i < n) {
    if (out.length >= MAX_BINARIES) break;
    const top = stack.at(-1);
    const ch = src[i]!;

    if (top?.kind === 'dquote') {
      if (ch === '\\') {
        const next = src[i + 1];
        if (next === '\n') {
          i += 2; // line continuation
        } else if (next === '$' || next === '`' || next === '"' || next === '\\') {
          word += next;
          i += 2;
        } else {
          // In double quotes bash keeps the backslash before other chars —
          // preserves quoted Windows paths ("C:\tools\rg.exe").
          word += ch;
          i++;
        }
        continue;
      }
      if (ch === '"') {
        stack.pop();
        i++;
        continue;
      }
      if (ch === '$' && src[i + 1] === '(') {
        openDollarParen();
        continue;
      }
      if (ch === '$' && src[i + 1] === '{') {
        if (atCmd || wrapper) wordDynamic = true;
        i = skipParameterExpansion(i);
        continue;
      }
      if (ch === '`') {
        i++;
        pushSubst('backtick');
        continue;
      }
      if (ch === '$' && (atCmd || wrapper)) wordDynamic = true;
      word += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      if (src[i + 1] === '\n')
        i += 2; // line continuation
      else if (/^[A-Za-z]:/u.test(word) && !WHITESPACE_RE.test(src[i + 1] ?? '')) {
        // Preserve separators in unquoted Windows absolute paths so
        // C:\\tools\\rg.exe basenames to `rg` instead of C:toolsrg.exe.
        word += ch;
        i++;
      } else {
        word += src[i + 1] ?? '';
        i += 2;
      }
      continue;
    }
    if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      word += close === -1 ? src.slice(i + 1) : src.slice(i + 1, close);
      i = close === -1 ? n : close + 1;
      continue;
    }
    if (ch === '"') {
      stack.push({ kind: 'dquote' });
      i++;
      continue;
    }
    if (ch === '`') {
      if (top?.kind === 'backtick') {
        popSubst();
        i++;
      } else {
        i++;
        pushSubst('backtick');
      }
      continue;
    }
    if (ch === '$') {
      if (src[i + 1] === '(') {
        openDollarParen();
        continue;
      }
      if (src[i + 1] === '{') {
        if (atCmd || wrapper) wordDynamic = true;
        i = skipParameterExpansion(i);
        continue;
      }
      if (src[i + 1] === "'") {
        if (atCmd || wrapper) wordDynamic = true;
        i = skipAnsiCQuote(i);
        continue;
      }
      if (atCmd || wrapper) wordDynamic = true;
      word += ch;
      i++;
      continue;
    }
    if (ch === '(') {
      if (word) {
        if (ASSIGNMENT_RE.test(word)) {
          // `arr=(a b c)` — array assignment; elements are data, not commands.
          word = '';
          i = skipParenGroup(i);
          continue;
        }
        // `foo(…` — function definition; the name is not an invocation.
        const functionName = toBinaryName(word);
        word = '';
        i++;
        while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
        if (src[i] === ')') {
          if (functionName) definedFunctions.add(functionName);
          i++;
          resetCmd(); // the body that follows starts at command position
        }
        continue;
      }
      // `()` — the parens of a function definition; the body that follows
      // starts at command position.
      let close = i + 1;
      while (close < n && (src[close] === ' ' || src[close] === '\t')) close++;
      if (src[close] === ')' && !inOperandContext()) {
        i = close + 1;
        resetCmd();
        continue;
      }
      if (src[i + 1] === '(' && atCmd) {
        // `((…))` arithmetic command
        i = skipParenGroup(i);
        continue;
      }
      if (top?.kind === 'subst') top.depth++;
      // Inside `[[ ( … ) ]]` or a `(pattern)` case list the paren groups
      // operands/patterns — no command follows it.
      if (!inOperandContext()) resetCmd();
      i++;
      continue;
    }
    if (ch === ')') {
      if (top?.kind === 'subst') {
        top.depth--;
        if (top.depth === 0) {
          popSubst();
          i++;
          continue;
        }
      }
      endWord();
      i++;
      if (inTest) {
        // `[[ ( … ) ]]` grouping close — still inside the test expression.
        dropCmd();
      } else if (caseLevel > 0 && inCasePattern) {
        // `foo)` closes a case pattern — a command follows.
        inCasePattern = false;
        resetCmd();
      } else {
        // Subshell close (or stray paren) — nothing recordable follows
        // until a real separator.
        dropCmd();
      }
      continue;
    }
    if (ch === '\n') {
      endWord();
      if (pendingHeredocs.length > 0) {
        i = consumeHeredocs(i + 1);
        pendingHeredocs = [];
      } else i++;
      // Multi-line `case` bodies put patterns at line starts — a newline in
      // the pattern list (or inside `[[ … ]]`) is not a command boundary.
      if (!inOperandContext() && !inLoopHeader && !expectFunctionName) resetCmd();
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      endWord();
      i++;
      continue;
    }
    if (ch === '#' && !word) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === ';') {
      endWord();
      let run = 1;
      while (src[i + run] === ';') run++;
      // `;;` / `;&` / `;;&` end a case branch — the next token is a pattern,
      // not a command; plain `;` separates commands.
      const caseBreak = run >= 2 || src[i + run] === '&';
      i += run + (src[i + run] === '&' ? 1 : 0);
      if (caseBreak && caseLevel > 0) {
        inCasePattern = true;
        dropCmd();
      } else if (!inLoopHeader) resetCmd();
      continue;
    }
    if (ch === '|') {
      endWord();
      i += src[i + 1] === '|' || src[i + 1] === '&' ? 2 : 1;
      // Inside `[[ … ]]` || is a boolean operator; in a case pattern list
      // `a|b)` it separates pattern alternatives — neither starts a command.
      if (!inOperandContext()) resetCmd();
      continue;
    }
    if (ch === '&') {
      endWord();
      if (src[i + 1] === '&') {
        i += 2;
        // Inside `[[ … ]]`, && is a boolean operator between operands.
        if (!inTest) resetCmd();
        continue;
      }
      if (src[i + 1] === '>') {
        i += src[i + 2] === '>' ? 3 : 2;
        skipWord = true;
        continue;
      }
      i++;
      if (!inTest) resetCmd();
      continue;
    }
    if (ch === '<') {
      endWord(true);
      if (src[i + 1] === '<') {
        if (src[i + 2] === '<') {
          i += 3;
          skipWord = true; // herestring — the word is data
          continue;
        }
        i += 2;
        readHeredocDelim();
        continue;
      }
      if (src[i + 1] === '(') {
        // process substitution `<(cmd)`
        i += 2;
        pushSubst('subst');
        continue;
      }
      i += src[i + 1] === '&' ? 2 : 1;
      skipWord = true;
      continue;
    }
    if (ch === '>') {
      endWord(true);
      if (src[i + 1] === '(') {
        i += 2;
        pushSubst('subst');
        continue;
      }
      i += src[i + 1] === '>' || src[i + 1] === '&' || src[i + 1] === '|' ? 2 : 1;
      skipWord = true;
      continue;
    }
    word += ch;
    i++;
  }
  endWord();

  return out;
}

export function extractBashCommand(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = (input as Record<string, unknown>).command;
  return typeof value === 'string' ? value : null;
}

export function toolResultContentToText(content: unknown): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (Array.isArray(content)) return content.map(toolResultContentToText).join('\n');
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
    return Object.values(obj).map(toolResultContentToText).join('\n');
  }
  return '';
}
