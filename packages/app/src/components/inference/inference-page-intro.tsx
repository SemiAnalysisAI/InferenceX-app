'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { useClientPathname } from '@/hooks/useClientPathname';
import { languageAlternates, localePath, type Locale } from '@/lib/i18n/i18n';
import { inferenceModelMeta, inferenceModelMetaZh } from '@/lib/routing/inference-model-meta';
import { TAB_META } from '@/lib/routing/tab-meta';
import { TAB_META_ZH } from '@/lib/routing/tab-meta-zh';
import {
  getInferenceModelBySlug,
  inferenceModelForPathname,
  inferenceModelPath,
} from '@/lib/routing/inference-model-slug';
import { useGlobalFilterSelection } from '@/providers/GlobalFilterContext';

export function InferencePageIntro({ locale }: { locale: Locale }) {
  const pathname = useClientPathname(usePathname());
  const { selectedModel } = useGlobalFilterSelection();
  const entry =
    inferenceModelForPathname(pathname) === null ? null : getInferenceModelBySlug(selectedModel);
  const meta = entry
    ? locale === 'zh'
      ? inferenceModelMetaZh(entry)
      : inferenceModelMeta(entry)
    : null;
  const title = meta ? `${meta.title} | ${SITE_NAME}` : null;
  const description = meta?.description;
  const enPath = entry ? inferenceModelPath(entry.slug) : null;

  useEffect(() => {
    if (!title || !description || !enPath) return;
    // Shallow model navigation leaves Next's server-rendered metadata mounted.
    const url = `${SITE_URL}${localePath(enPath, locale)}`;
    const attributes = [
      ['meta[name="description"]', 'content', description],
      ['meta[property="og:title"]', 'content', title],
      ['meta[property="og:description"]', 'content', description],
      ['meta[property="og:url"]', 'content', url],
      ['meta[name="twitter:title"]', 'content', title],
      ['meta[name="twitter:description"]', 'content', description],
      ['link[rel="canonical"]', 'href', url],
      ...Object.entries(languageAlternates(enPath)).map(([language, href]) => [
        `link[rel="alternate"][hreflang="${language}"]`,
        'href',
        href,
      ]),
    ];
    const syncMetadata = () => {
      // Keep React's title text node intact so route cleanup can still remove it.
      const titleText = document.querySelector('title')?.firstChild;
      if (titleText && titleText.nodeValue !== title) titleText.nodeValue = title;
      for (const [selector, attribute, value] of attributes) {
        document.querySelectorAll(selector).forEach((node) => {
          if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
        });
      }
    };
    syncMetadata();
    // Next can stream the original route metadata after this effect has run.
    const observer = new MutationObserver(syncMetadata);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [title, description, enPath, locale]);

  const heading = meta?.title ?? (locale === 'zh' ? TAB_META_ZH : TAB_META).inference.title;
  // The chart card already explains the page, so the h1 stays for search and screen readers only.
  return (
    <h1 data-testid="inference-page-heading" className="sr-only">
      {heading}
    </h1>
  );
}
