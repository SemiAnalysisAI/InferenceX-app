import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEPLOYMENT_FLAG_NAMES, parseDeploymentFlags } from './deployment-flags';

const PUBLIC_DEFAULTS = {
  defaultTcoBasis: 'internal',
  tcoBasisSelector: 'scoped',
  disabledThemes: [],
  unofficialWatermarkImage: true,
};

describe('parseDeploymentFlags', () => {
  it('keeps the public site behavior when no flag is set', () => {
    expect(parseDeploymentFlags({})).toEqual(PUBLIC_DEFAULTS);
    expect(
      parseDeploymentFlags({
        NEXT_PUBLIC_DEFAULT_TCO_BASIS: '',
        NEXT_PUBLIC_TCO_BASIS_SELECTOR: '  ',
        NEXT_PUBLIC_DISABLED_THEMES: ' , ',
        NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE: '',
      }),
    ).toEqual(PUBLIC_DEFAULTS);
  });

  it('applies every documented override', () => {
    expect(
      parseDeploymentFlags({
        NEXT_PUBLIC_DEFAULT_TCO_BASIS: 'external',
        NEXT_PUBLIC_TCO_BASIS_SELECTOR: 'always',
        NEXT_PUBLIC_DISABLED_THEMES: 'csgo,gta,doom,halo',
        NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE: 'off',
      }),
    ).toEqual({
      defaultTcoBasis: 'external',
      tcoBasisSelector: 'always',
      disabledThemes: ['csgo', 'gta', 'doom', 'halo'],
      unofficialWatermarkImage: false,
    });
  });

  it('accepts documented values case-insensitively and trims whitespace', () => {
    expect(
      parseDeploymentFlags({
        NEXT_PUBLIC_DEFAULT_TCO_BASIS: ' External ',
        NEXT_PUBLIC_TCO_BASIS_SELECTOR: 'ALWAYS',
        NEXT_PUBLIC_DISABLED_THEMES: ' CSGO , gta ,,',
        NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE: ' Off',
      }),
    ).toEqual({
      defaultTcoBasis: 'external',
      tcoBasisSelector: 'always',
      disabledThemes: ['csgo', 'gta'],
      unofficialWatermarkImage: false,
    });
    expect(
      parseDeploymentFlags({
        NEXT_PUBLIC_DEFAULT_TCO_BASIS: 'internal',
        NEXT_PUBLIC_TCO_BASIS_SELECTOR: 'scoped',
        NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE: 'ON',
      }),
    ).toEqual(PUBLIC_DEFAULTS);
  });

  it('falls back to the public behavior for unrecognized values', () => {
    expect(
      parseDeploymentFlags({
        NEXT_PUBLIC_DEFAULT_TCO_BASIS: 'owner',
        NEXT_PUBLIC_TCO_BASIS_SELECTOR: 'everywhere',
        NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE: 'false',
      }),
    ).toEqual(PUBLIC_DEFAULTS);
  });
});

// The module reads the build env once at load, so each case reloads it.
async function loadFlags() {
  vi.resetModules();
  const module = await import('./deployment-flags');
  return module.DEPLOYMENT_FLAGS;
}

describe('DEPLOYMENT_FLAGS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads each flag from its NEXT_PUBLIC_ variable', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_TCO_BASIS', 'external');
    vi.stubEnv('NEXT_PUBLIC_TCO_BASIS_SELECTOR', 'always');
    vi.stubEnv('NEXT_PUBLIC_DISABLED_THEMES', 'doom');
    vi.stubEnv('NEXT_PUBLIC_UNOFFICIAL_WATERMARK_IMAGE', 'off');

    expect(await loadFlags()).toEqual({
      defaultTcoBasis: 'external',
      tcoBasisSelector: 'always',
      disabledThemes: ['doom'],
      unofficialWatermarkImage: false,
    });
  });

  it('uses the public defaults when the variables are unset', async () => {
    for (const name of DEPLOYMENT_FLAG_NAMES) vi.stubEnv(name, undefined);

    expect(await loadFlags()).toEqual(PUBLIC_DEFAULTS);
  });
});
