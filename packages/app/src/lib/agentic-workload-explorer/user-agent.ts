// Fall back to the verbatim User-Agent when clients omit x-stainless-* metadata.
// Codex CLI/Desktop encode version in the product token and OS/arch in its parenthesized suffix.

import { normalizePlatformOs } from '@semianalysisai/inferencex-db/proxytrace/shared/platform';

const CLI_VERSION_RE = /\b(?:claude-cli|codex-cli|codex-tui|Codex Desktop)\/(?<version>\S+)/u;
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

  const cliMatch = rawUa.match(CLI_VERSION_RE);
  const osArch = rawUa.match(OS_ARCH_RE);

  let os: string | null = null;
  let arch: string | null = null;
  if (osArch) {
    const archKey = osArch[2].trim().toLowerCase();
    os = normalizePlatformOs(osArch[1]);
    arch = ARCH_MAP[archKey] ?? null;
  }

  return {
    cliVersion: cliMatch?.[1] ?? null,
    os,
    arch,
  };
}
