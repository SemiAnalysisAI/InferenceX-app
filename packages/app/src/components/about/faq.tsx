import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_LABELS,
  GPU_KEYS,
  GPU_VENDORS,
  PRECISION_KEYS,
} from '@semianalysisai/inferencex-constants';

import { CAROUSEL_LABELS, CAROUSEL_ORGS } from '@/components/quotes/quotes-data';
import { Card } from '@/components/ui/card';

import { FaqQuestionLink } from './faq-question-link';

export interface FaqLink {
  readonly text: string;
  readonly href: string;
}

export interface FaqItem {
  /** Stable, locale-independent fragment identifier for direct links. */
  readonly id: string;
  readonly question: string;
  /** Intro text shown before any list. */
  readonly answer: string;
  /** Optional link rendered inline after the answer text. */
  readonly link?: FaqLink;
  /** Optional bullet list rendered below the answer text. */
  readonly list?: readonly string[];
}

const gpusByVendor = [...GPU_KEYS].reduce<Record<string, string[]>>((groups, key) => {
  const vendor = GPU_VENDORS[key] ?? 'Other';
  (groups[vendor] ??= []).push(key.toUpperCase());
  return groups;
}, {});

export const GENERATED_FAQ_DATA = {
  gpuGroups: Object.entries(gpusByVendor).map(([vendor, gpus]) => `${vendor}: ${gpus.join(', ')}`),
  // /about lists each DB bucket separately, including point releases that other
  // surfaces collapse under one display name.
  modelNames: Object.values({
    ...DB_MODEL_TO_DISPLAY,
    'kimik2.6': 'Kimi-K2.6',
    'kimik2.7-code': 'Kimi-K2.7-Code',
    'minimaxm2.7': 'MiniMax-M2.7',
    'glm5.1': 'GLM-5.1',
  }),
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
    <section>
      <Card>
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <dl className="divide-y divide-border">
          {items.map((item) => (
            <div id={item.id} key={item.id} className="scroll-mt-24 py-4 first:pt-0 last:pb-0">
              <dt className="font-medium mb-1">
                <FaqQuestionLink id={item.id} question={item.question} />
              </dt>
              <dd className="text-muted-foreground text-sm">
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
                          className="text-brand hover:underline font-medium"
                        >
                          {item.link.text}
                        </a>
                      </>
                    )}
                  </p>
                )}
                {item.list && (
                  <ul className="mt-1.5 ml-8 list-disc space-y-0.5">
                    {item.list.map((listItem) => (
                      <li key={listItem}>{listItem}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}
