import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';

import { Model, getModelLogo } from '@/lib/data-mappings';
import { MODEL_DEVELOPER_LOGOS, getModelDeveloperLogo } from '@/lib/model-logos';

const MODELS_DIR = path.join(process.cwd(), 'content', 'models');
const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

describe('model developer logos', () => {
  it('maps every model-page developer to a logo', () => {
    const developers = new Set(
      fs
        .readdirSync(MODELS_DIR)
        .filter((f) => f.endsWith('.mdx'))
        .map((f) => {
          const { data } = matter(fs.readFileSync(path.join(MODELS_DIR, f), 'utf8'));
          return (data as { developer: string }).developer;
        }),
    );
    for (const developer of developers) {
      expect(
        getModelDeveloperLogo(developer),
        `missing logo mapping for '${developer}'`,
      ).toBeTruthy();
    }
  });

  it('points every developer mapping at an existing file under public/logos', () => {
    for (const [developer, logo] of Object.entries(MODEL_DEVELOPER_LOGOS)) {
      expect(
        fs.existsSync(path.join(LOGOS_DIR, logo)),
        `logo file '${logo}' for '${developer}' not found in public/logos`,
      ).toBe(true);
    }
  });

  it('points every MODEL_CONFIG logo at an existing file under public/logos', () => {
    for (const model of Object.values(Model)) {
      const logo = getModelLogo(model);
      if (!logo) continue;
      expect(
        fs.existsSync(path.join(LOGOS_DIR, logo)),
        `logo file '${logo}' for model '${model}' not found in public/logos`,
      ).toBe(true);
    }
  });

  it('returns undefined for unknown developers', () => {
    expect(getModelDeveloperLogo('Unknown Lab')).toBeUndefined();
  });
});
