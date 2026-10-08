import { describe, expect, it } from 'vitest';
import { harnessFromUserAgent } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { normalizePlatformOs } from '@semianalysisai/inferencex-db/proxytrace/shared/platform';
import { parseUserAgent } from '@/lib/agentic-workload-explorer/user-agent';

describe('platform OS normalization', () => {
  it.each([
    ['Mac OS 26.1.0', 'MacOS'],
    ['darwin 25.5.0', 'MacOS'],
    ['Windows NT 10.0', 'Windows'],
    ['Ubuntu 24.4.0', 'Linux'],
    ['Linux', 'Linux'],
    ['FreeBSD 15.0', null],
  ])('normalizes %s without guessing', (value, expected) => {
    expect(normalizePlatformOs(value)).toBe(expected);
  });

  it('uses the same normalization for Codex user agents', () => {
    expect(parseUserAgent('codex-tui/0.130.0 (darwin 25.5.0; arm64)')).toMatchObject({
      os: 'MacOS',
      arch: 'arm64',
    });
    expect(parseUserAgent('codex-tui/0.130.0 (Ubuntu 24.4.0; x86_64)')).toMatchObject({
      os: 'Linux',
      arch: 'x64',
    });
  });
});

describe('harness detection', () => {
  it.each([
    ['claude-cli/2.1.97 (external, cli)', 'claude-code'],
    ['claude-cli/2.1.97 (external, sdk-ts, agent-sdk/0.3.218)', 'claude-code'],
    ['codex-tui/0.154.0 (Ubuntu 24.4.0; x86_64) xterm-256color', 'codex'],
    ['Codex Desktop/0.146.0 (Mac OS 26.5.2; arm64)', 'codex'],
    ['codex_exec/0.144.0', 'codex'],
    ['pi (linux 7.2.5-1-default; x64)', 'pi'],
    ['omp/18.0.8', 'omp'],
    ['pi/17.2.10 (darwin 25.5.0; arm64)', 'omp'],
    ['OpenAI/JS 6.26.0', 'other'],
    ['Anthropic/JS 0.91.1', 'other'],
    [undefined, 'other'],
  ])('classifies %s as %s', (userAgent, expected) => {
    expect(harnessFromUserAgent(userAgent)).toBe(expected);
  });
});
