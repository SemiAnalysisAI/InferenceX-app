import { describe, expect, it, vi } from 'vitest';

import { Model, MODEL_OPTIONS } from '@/lib/catalog/data-mappings';
import { ModelArchitectureInfoLink } from './ModelArchitectureInfoLink';

vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

describe('ModelArchitectureInfoLink', () => {
  it.each(['en', 'zh'] as const)(
    'does not link a pending Flash registration to a missing %s article',
    (locale) => {
      expect(ModelArchitectureInfoLink({ model: Model.GLM_5_3_Flash, locale })).toBeNull();
    },
  );

  it.each(MODEL_OPTIONS.filter((model) => model !== Model.GLM_5_3_Flash))(
    'preserves the sourced architecture link for %s in both locales',
    (model) => {
      expect(ModelArchitectureInfoLink({ model, locale: 'en' })).not.toBeNull();
      expect(ModelArchitectureInfoLink({ model, locale: 'zh' })).not.toBeNull();
    },
  );
});
