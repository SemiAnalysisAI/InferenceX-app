import { describe, expect, it, vi } from 'vitest';

import { Model, MODEL_OPTIONS } from '@/lib/catalog/data-mappings';
import { ModelArchitectureInfoLink } from './ModelArchitectureInfoLink';

vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

// Registered for ingest ahead of sourced architecture data and an article.
const UNSOURCED_MODELS: readonly Model[] = [Model.GLM_5_3_Flash, Model.Kimi_K3_1_Pro];

describe('ModelArchitectureInfoLink', () => {
  it.each(UNSOURCED_MODELS)(
    'does not link the pending %s registration to a missing article',
    (model) => {
      expect(ModelArchitectureInfoLink({ model, locale: 'en' })).toBeNull();
      expect(ModelArchitectureInfoLink({ model, locale: 'zh' })).toBeNull();
    },
  );

  it.each(MODEL_OPTIONS.filter((model) => !UNSOURCED_MODELS.includes(model)))(
    'preserves the sourced architecture link for %s in both locales',
    (model) => {
      expect(ModelArchitectureInfoLink({ model, locale: 'en' })).not.toBeNull();
      expect(ModelArchitectureInfoLink({ model, locale: 'zh' })).not.toBeNull();
    },
  );
});
