export const PLATFORM_OS_ALIASES = {
  MacOS: ['mac os', 'mac os x', 'macos', 'darwin'],
  Windows: ['windows', 'windows nt', 'windows_nt'],
  Linux: [
    'linux',
    'ubuntu',
    'debian',
    'fedora',
    'centos',
    'rhel',
    'red hat enterprise linux',
    'alpine',
    'arch linux',
    'nixos',
  ],
} as const;

export type PlatformOs = keyof typeof PLATFORM_OS_ALIASES;

/**
 * Normalize an SDK/CLI platform label without guessing. Version suffixes in
 * Codex-style user agents are ignored; unrecognized operating systems stay
 * unknown instead of being folded into Linux.
 */
export function normalizePlatformOs(value: string | null | undefined): PlatformOs | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();

  for (const [os, aliases] of Object.entries(PLATFORM_OS_ALIASES)) {
    if (aliases.some((alias) => key === alias || key.startsWith(`${alias} `))) {
      return os as PlatformOs;
    }
  }
  return null;
}
