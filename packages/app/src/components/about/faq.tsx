import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_LABELS,
  GPU_KEYS,
  GPU_VENDORS,
  HW_REGISTRY,
  PRECISION_KEYS,
} from '@semianalysisai/inferencex-constants';

import { CAROUSEL_LABELS, CAROUSEL_ORGS } from '@/components/quotes/quotes-data';
import { isModelVisible } from '@/lib/catalog/data-mappings';
import {
  ARTICLE_H2_CLASS,
  READING_LINK_CLASS,
  READING_SECTION_CLASS,
} from '@/components/ui/reading-layout';
import { cn } from '@/lib/shared/utils';

import { FaqQuestionLink } from './faq-question-link';

export interface FaqLink {
  readonly text: string;
  readonly href: string;
}

export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly link?: FaqLink;
  readonly list?: readonly string[];
}

const gpusByVendor = [...GPU_KEYS].reduce<Record<string, string[]>>((groups, key) => {
  const vendor = GPU_VENDORS[key] ?? 'Other';
  (groups[vendor] ??= []).push(HW_REGISTRY[key]?.label ?? key.toUpperCase());
  return groups;
}, {});

export const GENERATED_FAQ_DATA = {
  gpuGroups: Object.entries(gpusByVendor).map(([vendor, gpus]) => `${vendor}: ${gpus.join(', ')}`),
  // Several DB keys share one display name (glm5.2 and glm5.3 both show as GLM-5.2), so dedupe.
  modelNames: [
    ...new Set(
      Object.values({
        ...DB_MODEL_TO_DISPLAY,
        'kimik2.6': 'Kimi-K2.6',
        'kimik2.7-code': 'Kimi-K2.7-Code',
        'minimaxm2.7': 'MiniMax-M2.7',
        'glm5.1': 'GLM-5.1',
      }),
    ),
  ].filter((model) => isModelVisible(model)),
  frameworkNames: [...new Set(Object.values(FRAMEWORK_LABELS))].map((name) =>
    name.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, ''),
  ),
  precisionNames: [...PRECISION_KEYS].map((precision) => precision.toUpperCase()),
  supporterOrgs: CAROUSEL_ORGS.map((org) => CAROUSEL_LABELS[org] ?? org),
} as const;

export function buildFaqJsonLd(items: readonly FaqItem[], inLanguage?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(inLanguage && { inLanguage }),
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: [item.answer, item.link?.text, ...(item.list ?? [])].filter(Boolean).join(' '),
      },
    })),
  };
}

export function FaqList({ title, items }: { title: string; items: readonly FaqItem[] }) {
  return (
    <section className={READING_SECTION_CLASS}>
      <h2 className={cn(ARTICLE_H2_CLASS, 'mb-6')}>{title}</h2>
      <dl className="max-w-measure divide-y divide-border/30">
        {items.map((item) => (
          <div
            id={item.id}
            key={item.id}
            className="flex scroll-mt-24 flex-col gap-2 py-5 first:pt-0 last:pb-0"
          >
            <dt className="min-w-0 font-semibold">
              <FaqQuestionLink id={item.id} question={item.question} />
            </dt>
            <dd className="min-w-0 leading-reading text-foreground">
              {item.answer && (
                <p>
                  {item.answer}
                  {item.link && (
                    <>
                      {' '}
                      <a
                        href={item.link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={READING_LINK_CLASS}
                      >
                        {item.link.text}
                      </a>
                    </>
                  )}
                </p>
              )}
              {item.list && (
                <ul className="mt-3 ml-5 list-disc space-y-2 first:mt-0">
                  {item.list.map((listItem) => (
                    <li key={listItem}>{listItem}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
