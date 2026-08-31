'use client';

import { Card } from '@/components/ui/card';
import { useLocale } from '@/lib/use-locale';

import {
  COLLECTIVEX_KNOWN_FOOTNOTES,
  COLLECTIVEX_KNOWN_LIBRARIES,
  COLLECTIVEX_KNOWN_SKUS,
  COLLECTIVEX_KNOWN_SUPPORT,
  collectiveXKnownFootnoteOrder,
  type CollectiveXKnownEp,
} from './known-support';

const MODES = ['normal', 'low-latency'] as const;

const STRINGS = {
  en: {
    title: 'Known kernel support',
    description:
      'The full SKU × library picture, independent of the runs above: green combinations work on the fleet, red combinations are known not to work (the numbered notes say why), and gray combinations do not exist for that pairing.',
    modes: {
      normal: 'Throughput kernels',
      'low-latency': 'Low-latency kernels',
    },
    axes: 'SKU / Library',
    works: 'Works',
    broken: 'Known not to work',
    na: 'Not applicable',
    notes: 'Notes',
  },
  zh: {
    title: '已知 Kernel 支持情况',
    description:
      '与上方勾选的运行无关的完整 SKU × 集合通信库支持图景：绿色组合在集群上可用，红色组合已知不可用（编号注释说明原因），灰色组合对该配对不存在。',
    modes: {
      normal: '吞吐量 Kernel',
      'low-latency': '低延迟 Kernel',
    },
    axes: 'SKU / 集合通信库',
    works: '可用',
    broken: '已知不可用',
    na: '不适用',
    notes: '注释',
  },
} as const;

const EP_CHIP_CLASS: Record<CollectiveXKnownEp['status'], string> = {
  works: 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  broken: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  na: 'border-border/60 bg-muted/20 text-muted-foreground/70',
};

function EpChip({
  ep,
  degree,
  noteNumber,
  noteText,
}: {
  ep: CollectiveXKnownEp;
  degree: 8 | 16;
  noteNumber: number | null;
  noteText: string | null;
}) {
  const glyph = ep.status === 'works' ? '✓' : ep.status === 'broken' ? '✕' : '—';
  const label = `EP${degree} ${glyph}${noteNumber === null ? '' : ` (note ${noteNumber})`}`;
  return (
    <span
      data-testid="collectivex-known-ep"
      data-degree={degree}
      data-status={ep.status}
      title={noteText ?? undefined}
      aria-label={noteText ? `${label}: ${noteText}` : label}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-2xs leading-none whitespace-nowrap ${EP_CHIP_CLASS[ep.status]}`}
    >
      EP{degree} {glyph}
      {noteNumber === null ? null : <sup className="font-sans">{noteNumber}</sup>}
    </span>
  );
}

export function CollectiveXSupportMatrices() {
  const locale = useLocale();
  const t = STRINGS[locale];

  return (
    <Card data-testid="collectivex-support-matrices" className="min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LegendKey status="works" label={t.works} />
          <LegendKey status="broken" label={t.broken} />
          <LegendKey status="na" label={t.na} />
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4">
        {MODES.map((mode) => {
          const noteOrder = collectiveXKnownFootnoteOrder(mode);
          const noteNumberOf = (note: string | undefined): number | null =>
            note ? noteOrder.indexOf(note) + 1 : null;
          const noteTextOf = (note: string | undefined): string | null =>
            note ? COLLECTIVEX_KNOWN_FOOTNOTES[note][locale] : null;
          return (
            <section
              key={mode}
              data-testid={`collectivex-support-matrix-${mode}`}
              className="min-w-0 overflow-hidden rounded-lg border border-border/60"
            >
              <h3 className="border-b border-border/60 bg-muted/20 px-4 py-3 text-sm font-semibold">
                {t.modes[mode]}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <caption className="sr-only">
                    {t.modes[mode]} · {t.axes}
                  </caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="bg-muted/30 px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                      >
                        {t.axes}
                      </th>
                      {COLLECTIVEX_KNOWN_LIBRARIES.map((library) => (
                        <th
                          key={library}
                          scope="col"
                          className="border-l border-border/60 bg-muted/30 px-3 py-2 text-center text-xs font-medium whitespace-nowrap"
                        >
                          {library}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COLLECTIVEX_KNOWN_SKUS.map((sku) => (
                      <tr key={sku} className="border-t border-border/60">
                        <th
                          scope="row"
                          className="bg-muted/10 px-3 py-2 text-left font-mono text-xs font-semibold whitespace-nowrap"
                        >
                          {sku.toUpperCase()}
                        </th>
                        {COLLECTIVEX_KNOWN_LIBRARIES.map((library) => {
                          const kase = COLLECTIVEX_KNOWN_SUPPORT[mode][sku][library];
                          const pairNa = kase.ep8.status === 'na' && kase.ep16.status === 'na';
                          return (
                            <td
                              key={library}
                              data-testid="collectivex-known-cell"
                              data-mode={mode}
                              data-sku={sku}
                              data-library={library}
                              className="border-l border-border/60 px-2 py-1.5 text-center"
                            >
                              {pairNa ? (
                                // The whole pairing does not exist; one muted
                                // dash reads better than two identical chips.
                                <span
                                  data-testid="collectivex-known-na"
                                  title={noteTextOf(kase.ep8.note) ?? undefined}
                                  aria-label={`${sku.toUpperCase()} × ${library}: ${t.na}${
                                    noteTextOf(kase.ep8.note)
                                      ? ` — ${noteTextOf(kase.ep8.note)}`
                                      : ''
                                  }`}
                                  className="text-muted-foreground/60"
                                >
                                  —{kase.ep8.note ? <sup>{noteNumberOf(kase.ep8.note)}</sup> : null}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <EpChip
                                    ep={kase.ep8}
                                    degree={8}
                                    noteNumber={noteNumberOf(kase.ep8.note)}
                                    noteText={noteTextOf(kase.ep8.note)}
                                  />
                                  <EpChip
                                    ep={kase.ep16}
                                    degree={16}
                                    noteNumber={noteNumberOf(kase.ep16.note)}
                                    noteText={noteTextOf(kase.ep16.note)}
                                  />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border/60 bg-muted/10 px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground">{t.notes}</h4>
                <ol
                  data-testid={`collectivex-known-notes-${mode}`}
                  className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted-foreground"
                >
                  {noteOrder.map((note) => (
                    <li key={note}>{COLLECTIVEX_KNOWN_FOOTNOTES[note][locale]}</li>
                  ))}
                </ol>
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function LegendKey({ status, label }: { status: CollectiveXKnownEp['status']; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-2xs leading-none ${EP_CHIP_CLASS[status]}`}
      >
        {status === 'works' ? '✓' : status === 'broken' ? '✕' : '—'}
      </span>
      {label}
    </span>
  );
}
