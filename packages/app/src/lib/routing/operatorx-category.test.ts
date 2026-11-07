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
    expect(operatorXCategoryPath('moe')).toBe('/opx/moe');
  });
});

describe('operatorXCategoryForPathname', () => {
  it('reads the category from English and /zh paths', () => {
    expect(operatorXCategoryForPathname('/opx/model')).toBe('model');
    expect(operatorXCategoryForPathname('/zh/opx/attention/')).toBe('attention');
    expect(operatorXCategoryForPathname('/opx/moe?model=x#top')).toBe('moe');
  });

  it('returns null off the category pages', () => {
    expect(operatorXCategoryForPathname('/opx')).toBeNull();
    expect(operatorXCategoryForPathname('/zh/opx')).toBeNull();
    expect(operatorXCategoryForPathname('/opx/bogus')).toBeNull();
    expect(operatorXCategoryForPathname('/opx/gemm/extra')).toBeNull();
    expect(operatorXCategoryForPathname('/infx/inference/gemm')).toBeNull();
    expect(operatorXCategoryForPathname(null)).toBeNull();
  });
});

describe('operatorXCategoryRouteForSelection', () => {
  it('keeps the locale of the current path', () => {
    expect(operatorXCategoryRouteForSelection('/opx', 'moe')).toBe('/opx/moe');
    expect(operatorXCategoryRouteForSelection('/zh/opx/gemm', 'model')).toBe('/zh/opx/model');
  });
});

describe('operatorXCategoryRedirectUrl', () => {
  it('moves a legacy op value into the path and keeps the other parameters', () => {
    expect(redirect('/opx?op=model')).toBe('/opx/model');
    expect(redirect('/zh/opx?model=DeepSeek-V4-Pro&op=model&parallel=tp8')).toBe(
      '/zh/opx/model?model=DeepSeek-V4-Pro&parallel=tp8',
    );
    expect(redirect('/opx/gemm?op=moe&utm_source=x')).toBe('/opx/moe?utm_source=x');
  });

  it('drops an unknown op value and keeps the path', () => {
    expect(redirect('/opx?op=bogus&workload=gemm')).toBe('/opx?workload=gemm');
    expect(redirect('/zh/opx/attention?op=')).toBe('/zh/opx/attention');
  });

  it('leaves links without op and other pages alone', () => {
    expect(redirect('/opx')).toBeNull();
    expect(redirect('/opx/model?model=x')).toBeNull();
    expect(redirect('/api/v1/operatorx/compare?op=gemm')).toBeNull();
    expect(redirect('/opx/model/extra?op=gemm')).toBeNull();
  });
});
