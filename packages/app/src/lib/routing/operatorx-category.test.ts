import { describe, expect, it } from 'vitest';

import {
  isOperatorXCategory,
  OPERATORX_CATEGORIES,
  operatorXCategoryForPathname,
  operatorXCategoryPath,
  operatorXCategoryRedirectUrl,
  operatorXCategoryRouteForSelection,
} from './operatorx-category';

const redirect = (path: string) =>
  operatorXCategoryRedirectUrl(new URL(path, 'https://inferencex.test'))
    ?.toString()
    .replace('https://inferencex.test', '') ?? null;

describe('OperatorX categories', () => {
  it('uses the former op values as slugs', () => {
    expect(OPERATORX_CATEGORIES.map((entry) => entry.slug)).toEqual([
      'gemm',
      'moe',
      'attention',
      'model',
    ]);
    expect(isOperatorXCategory('model')).toBe(true);
    expect(isOperatorXCategory('Model')).toBe(false);
    expect(isOperatorXCategory(null)).toBe(false);
    expect(operatorXCategoryPath('moe')).toBe('/operatorx/moe');
  });
});

describe('operatorXCategoryForPathname', () => {
  it('reads the category from English and /zh paths', () => {
    expect(operatorXCategoryForPathname('/operatorx/model')).toBe('model');
    expect(operatorXCategoryForPathname('/zh/operatorx/attention/')).toBe('attention');
    expect(operatorXCategoryForPathname('/operatorx/moe?model=x#top')).toBe('moe');
  });

  it('returns null off the category pages', () => {
    expect(operatorXCategoryForPathname('/operatorx')).toBeNull();
    expect(operatorXCategoryForPathname('/zh/operatorx')).toBeNull();
    expect(operatorXCategoryForPathname('/operatorx/bogus')).toBeNull();
    expect(operatorXCategoryForPathname('/operatorx/gemm/extra')).toBeNull();
    expect(operatorXCategoryForPathname('/inference/gemm')).toBeNull();
    expect(operatorXCategoryForPathname(null)).toBeNull();
  });
});

describe('operatorXCategoryRouteForSelection', () => {
  it('keeps the locale of the current path', () => {
    expect(operatorXCategoryRouteForSelection('/operatorx', 'moe')).toBe('/operatorx/moe');
    expect(operatorXCategoryRouteForSelection('/zh/operatorx/gemm', 'model')).toBe(
      '/zh/operatorx/model',
    );
  });
});

describe('operatorXCategoryRedirectUrl', () => {
  it('moves a legacy op value into the path and keeps the other parameters', () => {
    expect(redirect('/operatorx?op=model')).toBe('/operatorx/model');
    expect(redirect('/zh/operatorx?model=DeepSeek-V4-Pro&op=model&parallel=tp8')).toBe(
      '/zh/operatorx/model?model=DeepSeek-V4-Pro&parallel=tp8',
    );
    expect(redirect('/operatorx/gemm?op=moe&utm_source=x')).toBe('/operatorx/moe?utm_source=x');
  });

  it('drops an unknown op value and keeps the path', () => {
    expect(redirect('/operatorx?op=bogus&workload=gemm')).toBe('/operatorx?workload=gemm');
    expect(redirect('/zh/operatorx/attention?op=')).toBe('/zh/operatorx/attention');
  });

  it('leaves links without op and other pages alone', () => {
    expect(redirect('/operatorx')).toBeNull();
    expect(redirect('/operatorx/model?model=x')).toBeNull();
    expect(redirect('/api/v1/operatorx/compare?op=gemm')).toBeNull();
    expect(redirect('/operatorx/model/extra?op=gemm')).toBeNull();
  });
});
