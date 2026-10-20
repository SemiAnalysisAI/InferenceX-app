import type { TcoBasis } from '../catalog/constants';

export type TcoBasisSelectorScope = 'scoped' | 'always';

export interface DeploymentFlags {
  readonly defaultTcoBasis: TcoBasis;
  readonly tcoBasisSelector: TcoBasisSelectorScope;
  readonly disabledThemes: readonly string[];
  readonly unofficialWatermarkImage: boolean;
}

export const DEPLOYMENT_FLAG_NAMES = [
  'NEXT_PUBLIC_DEFAULT_TCO_BASIS',
  'NEXT_PUBLIC_TCO_BASIS_SELECTOR',
  'NEXT_PUBLIC_DISABLED_THEMES',
  'NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE',
] as const;

export type DeploymentFlagEnv = Partial<Record<(typeof DEPLOYMENT_FLAG_NAMES)[number], string>>;

function choice<T extends string>(raw: string | undefined, values: readonly T[], fallback: T): T {
  const value = raw?.trim().toLowerCase();
  return values.find((candidate) => candidate === value) ?? fallback;
}

/** Unset or unrecognized values keep the public site's behavior. */
export function parseDeploymentFlags(env: DeploymentFlagEnv): DeploymentFlags {
  return {
    defaultTcoBasis: choice(
      env.NEXT_PUBLIC_DEFAULT_TCO_BASIS,
      ['internal', 'external'],
      'internal',
    ),
    tcoBasisSelector: choice(env.NEXT_PUBLIC_TCO_BASIS_SELECTOR, ['scoped', 'always'], 'scoped'),
    disabledThemes: (env.NEXT_PUBLIC_DISABLED_THEMES ?? '')
      .split(',')
      .map((theme) => theme.trim().toLowerCase())
      .filter(Boolean),
    unofficialWatermarkImage:
      choice(env.NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE, ['on', 'off'], 'on') === 'on',
  };
}

// Next.js inlines NEXT_PUBLIC_* values at build time only for literal `process.env.NAME` reads,
// so every flag is named here; passing `process.env` itself would leave the browser on defaults.
export const DEPLOYMENT_FLAGS: DeploymentFlags = parseDeploymentFlags({
  NEXT_PUBLIC_DEFAULT_TCO_BASIS: process.env.NEXT_PUBLIC_DEFAULT_TCO_BASIS,
  NEXT_PUBLIC_TCO_BASIS_SELECTOR: process.env.NEXT_PUBLIC_TCO_BASIS_SELECTOR,
  NEXT_PUBLIC_DISABLED_THEMES: process.env.NEXT_PUBLIC_DISABLED_THEMES,
  NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE: process.env.NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE,
});
