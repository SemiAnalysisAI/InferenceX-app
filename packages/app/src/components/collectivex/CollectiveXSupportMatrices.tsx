'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useMemo } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { collectiveXBackendLabel } from './data';
import {
  COLLECTIVEX_KNOWN_FOOTNOTES,
  COLLECTIVEX_KNOWN_LIBRARIES,
  COLLECTIVEX_KNOWN_SKUS,
  COLLECTIVEX_KNOWN_SUPPORT,
  collectiveXKnownFootnoteOrder,
  collectiveXKnownVersions,
  collectiveXShortLibraryVersion,
  type CollectiveXKnownEp,
  type CollectiveXVersionedSeries,
} from './known-support';

const MODES = ['normal', 'low-latency'] as const;

const STRINGS = {
  en: {
    title: 'Known kernel support',
    description:
      'The full SKU × library picture, independent of the runs above: ✓ marks combinations that work on the fleet, ✕ marks combinations known not to work (the numbered notes say why), and a dash marks combinations that are unavailable or awaiting qualification (see notes). Under each cell is the backend version the selected runs measured.',
    modes: {
      normal: 'Throughput kernels',
      'low-latency': 'Low-latency kernels',
    },
    axes: 'SKU / library',
    works: 'Works',
    broken: 'Known not to work',
    na: 'Not applicable',
    notes: 'Notes',
    note: (number: number) => ` (note ${number})`,
    version: 'Measured backend version',
  },
  zh: {
    title: '已知 Kernel 支持情况',
    description:
      '下表展示完整的 SKU × 集合通信库支持情况，不受上方已选运行影响：✓ 表示该组合可在集群上运行，✕ 表示已知不可用（原因见编号注释），短横线表示该组合尚不可用或待验证（详见注释）。每个单元格下方是所选运行实测的后端版本。',
    modes: {
      normal: '吞吐量 Kernel',
      'low-latency': '低延迟 Kernel',
    },
    axes: 'SKU / 集合通信库',
    works: '可用',
    broken: '已知不可用',
    na: '不适用',
    notes: '注释',
    note: (number: number) => `（注 ${number}）`,
    version: '实测后端版本',
  },
} as const;

/** Working pairs are the norm, so only the check mark carries color; broken pairs get the tint. */
const EP_CHIP_CLASS: Record<CollectiveXKnownEp['status'], string> = {
  works: 'bg-muted/50 text-foreground',
  broken: 'bg-destructive/10 text-destructive',
  na: 'text-muted-foreground/70',
};

const EP_GLYPH: Record<CollectiveXKnownEp['status'], { glyph: string; className?: string }> = {
  works: { glyph: '✓', className: 'text-success' },
  broken: { glyph: '✕' },
  na: { glyph: '—' },
};

function EpChip({
  ep,
  degree,
  noteNumber,
  noteText,
  formatNote,
}: {
  ep: CollectiveXKnownEp;
  degree: 8 | 16;
  noteNumber: number | null;
  noteText: string | null;
  formatNote: (number: number) => string;
}) {
  const { glyph, className: glyphClass } = EP_GLYPH[ep.status];
  const label = `EP${degree} ${glyph}${noteNumber === null ? '' : formatNote(noteNumber)}`;
  return (
    <span
      data-testid="collectivex-known-ep"
      data-degree={degree}
      data-status={ep.status}
      title={noteText ?? undefined}
      aria-label={noteText ? `${label}: ${noteText}` : label}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-2xs leading-none whitespace-nowrap ${EP_CHIP_CLASS[ep.status]}`}
    >
      EP{degree} <span className={glyphClass}>{glyph}</span>
      {noteNumber === null ? null : <sup className="font-sans">{noteNumber}</sup>}
    </span>
  );
}

export function CollectiveXSupportMatrices({
  series = [],
}: {
  /** The selected runs' series; each cell lists the backend versions they recorded. */
  series?: readonly CollectiveXVersionedSeries[];
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const versions = useMemo(() => collectiveXKnownVersions(series), [series]);

  const noteTextOf = (note: string | undefined): string | null =>
    note ? COLLECTIVEX_KNOWN_FOOTNOTES[note][locale] : null;

  return (
    <Card data-testid="collectivex-support-matrices" className="min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Heading level="card">{t.title}</Heading>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LegendKey status="works" label={t.works} />
          <LegendKey status="broken" label={t.broken} />
          <LegendKey status="na" label={t.na} />
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-8">
        {MODES.map((mode) => {
          const noteOrder = collectiveXKnownFootnoteOrder(mode);
          const noteNumberOf = (note: string | undefined): number | null =>
            note ? noteOrder.indexOf(note) + 1 : null;
          return (
            <section
              key={mode}
              data-testid={`collectivex-support-matrix-${mode}`}
              className="min-w-0 space-y-3"
            >
              <h3 className="text-sm font-medium">{t.modes[mode]}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <caption className="sr-only">
                    {t.modes[mode]} · {t.axes}
                  </caption>
                  <thead>
                    <tr className="border-b border-border/30">
                      <th
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                      >
                        {t.axes}
                      </th>
                      {COLLECTIVEX_KNOWN_LIBRARIES.map((library) => (
                        <th
                          key={library}
                          scope="col"
                          className="border-l border-border/20 px-3 py-2 text-center text-xs font-medium whitespace-nowrap"
                        >
                          {collectiveXBackendLabel(library)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COLLECTIVEX_KNOWN_SKUS.map((sku) => (
                      <tr key={sku} className="border-t border-border/20">
                        <th
                          scope="row"
                          className="px-3 py-2 text-left font-mono text-xs font-medium whitespace-nowrap"
                        >
                          {sku.toUpperCase()}
                        </th>
                        {COLLECTIVEX_KNOWN_LIBRARIES.map((library) => {
                          const kase = COLLECTIVEX_KNOWN_SUPPORT[mode][sku][library];
                          const pairNa = kase.ep8.status === 'na' && kase.ep16.status === 'na';
                          const cellVersions = versions.get(`${mode}/${sku}/${library}`) ?? [];
                          return (
                            <td
                              key={library}
                              data-testid="collectivex-known-cell"
                              data-mode={mode}
                              data-sku={sku}
                              data-library={library}
                              className="border-l border-border/20 px-2 py-1.5 text-center"
                            >
                              {pairNa ? (
                                <span
                                  data-testid="collectivex-known-na"
                                  title={noteTextOf(kase.ep8.note) ?? undefined}
                                  aria-label={`${sku.toUpperCase()} × ${collectiveXBackendLabel(library)}: ${t.na}${
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
                                    formatNote={t.note}
                                  />
                                  <EpChip
                                    ep={kase.ep16}
                                    degree={16}
                                    noteNumber={noteNumberOf(kase.ep16.note)}
                                    noteText={noteTextOf(kase.ep16.note)}
                                    formatNote={t.note}
                                  />
                                </span>
                              )}
                              {cellVersions.length > 0 ? (
                                <span
                                  data-testid="collectivex-known-version"
                                  title={`${t.version}: ${cellVersions.join(', ')}`}
                                  className="mt-1 block font-mono text-2xs leading-tight whitespace-nowrap text-muted-foreground"
                                >
                                  {[
                                    ...new Set(cellVersions.map(collectiveXShortLibraryVersion)),
                                  ].join(', ')}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
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
        className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-2xs leading-none ${EP_CHIP_CLASS[status]}`}
      >
        <span className={EP_GLYPH[status].className}>{EP_GLYPH[status].glyph}</span>
      </span>
      {label}
    </span>
  );
}
