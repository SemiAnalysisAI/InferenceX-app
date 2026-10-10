// Fall back to the verbatim User-Agent when clients omit x-stainless-* metadata.
// Codex CLI/Desktop encode version in the product token and OS/arch in its parenthesized suffix.
// Oh My Pi sends `omp/<version>` (`pi/<version>` on its 17.x line); Pi sends no version.

import { normalizePlatformOs } from '@semianalysisai/inferencex-db/proxytrace/shared/platform';

const CLI_VERSION_RE = /\b(?:claude-cli|codex[\w-]*|Codex Desktop|omp|pi)\/(?<version>\S+)/u;
const VERSION_CORE_RE = /^\d+(?:\.\d+)*/u;
const OS_ARCH_RE = /\((?<os>[^;)]+);\s*(?<arch>[^)]+)\)/u;

const ARCH_MAP: Record<string, string> = {
  arm64: 'arm64',
  aarch64: 'arm64',
  x86_64: 'x64',
  amd64: 'x64',
  x64: 'x64',
};

interface ParsedUserAgent {
  cliVersion: string | null;
  os: string | null;
  arch: string | null;
}

export function parseUserAgent(rawUa: string | null | undefined): ParsedUserAgent {
  if (!rawUa) return { cliVersion: null, os: null, arch: null };

  const cliMatch = CLI_VERSION_RE.exec(rawUa)?.groups;
  const osArch = OS_ARCH_RE.exec(rawUa)?.groups;

  let os: string | null = null;
  let arch: string | null = null;
  if (osArch) {
    const archKey = osArch.arch.trim().toLowerCase();
    os = normalizePlatformOs(osArch.os);
    arch = ARCH_MAP[archKey] ?? null;
  }

  return {
    cliVersion: cliMatch?.version ?? null,
    os,
    arch,
  };
}

/**
 * Semver-style ordering: dot-separated numeric parts compare numerically
 * (2.1.10 > 2.1.9 > 2.0.100); on a tie, a release sorts after any suffixed
 * prerelease and two suffixes compare as strings.
 */
export function compareVersions(a: string, b: string): number {
  const coreA = a.match(VERSION_CORE_RE)?.[0] ?? '';
  const coreB = b.match(VERSION_CORE_RE)?.[0] ?? '';
  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  const restA = a.slice(coreA.length);
  const restB = b.slice(coreB.length);
  if (restA === restB) return 0;
  if (!restA) return 1;
  if (!restB) return -1;
  return restA.localeCompare(restB, undefined, { numeric: true });
}
