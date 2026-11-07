import { isZhPathname, localePath } from '@/lib/i18n/i18n';

export const OPERATORX_CATEGORIES = [
  { slug: 'gemm', label: { en: 'GEMM', zh: 'GEMM' } },
  { slug: 'moe', label: { en: 'MoE', zh: 'MoE' } },
  { slug: 'attention', label: { en: 'Attention', zh: 'Attention' } },
  { slug: 'model', label: { en: 'Model view', zh: '模型视图' } },
] as const;

export type OperatorXCategory = (typeof OPERATORX_CATEGORIES)[number]['slug'];

export const DEFAULT_OPERATORX_CATEGORY: OperatorXCategory = 'gemm';

export function isOperatorXCategory(value: string | null | undefined): value is OperatorXCategory {
  return OPERATORX_CATEGORIES.some((entry) => entry.slug === value);
}

export function operatorXCategoryPath(category: OperatorXCategory): string {
  return `/operatorx/${category}`;
}

const OPERATORX_PATH = /^(?<locale>\/zh)?\/operatorx(?:\/(?<category>[^/]+))?\/?$/u;

export function operatorXCategoryForPathname(
  pathname: string | null | undefined,
): OperatorXCategory | null {
  if (!pathname) return null;
  const category = OPERATORX_PATH.exec(pathname.split(/[?#]/u, 1)[0])?.groups?.category;
  return isOperatorXCategory(category) ? category : null;
}

export function operatorXCategoryRouteForSelection(
  pathname: string,
  category: OperatorXCategory,
): string {
  return localePath(operatorXCategoryPath(category), isZhPathname(pathname) ? 'zh' : 'en');
}

export function operatorXCategoryRedirectUrl(url: URL): URL | null {
  const match = OPERATORX_PATH.exec(url.pathname);
  const op = url.searchParams.get('op');
  if (!match || op === null) return null;
  const target = new URL(url);
  target.searchParams.delete('op');
  if (isOperatorXCategory(op)) {
    target.pathname = `${match.groups?.locale ?? ''}${operatorXCategoryPath(op)}`;
  }
  return target;
}
