'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

import type { InferenceData } from '@/components/inference/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { getHardwareConfig } from '@/lib/constants';
import { buildLaunchCommand } from '@/lib/reproduce-command';
import { getDisplayLabel, updateRepoUrl } from '@/lib/utils';

type DrawerTab = 'command' | 'config' | 'environment';

interface ReproduceDrawerProps {
  /** The point to reproduce, or null when the drawer is closed. */
  point: InferenceData | null;
  /** ISL/OSL of the active sequence, used for command-line generation. */
  sequence?: { isl: number; osl: number };
  /** Selected model display key, passed through to launch-command generation. */
  model?: string;
  onClose: () => void;
}

/**
 * Drawer that explains how to reproduce a benchmark point: launch command,
 * full config JSON, environment (image, framework SHA, GPU SKU, run URL).
 *
 * Exits on Esc and outside-click without disturbing chart zoom or URL state —
 * the only state that lives outside this component is the selected `point`,
 * which the caller wipes via `onClose`.
 */
export default function ReproduceDrawer({ point, sequence, model, onClose }: ReproduceDrawerProps) {
  const open = point !== null;
  const [activeTab, setActiveTab] = useState<DrawerTab>('command');

  useEffect(() => {
    if (!open) return;
    setActiveTab('command');
  }, [point?.hwKey, point?.tp, point?.conc, point?.precision, open]);

  const launch = useMemo(() => {
    if (!point) return null;
    return buildLaunchCommand(point.framework ?? '', {
      model,
      precision: point.precision,
      tp: point.tp,
      ep: point.ep,
      dp_attention: point.dp_attention,
      spec_decoding: point.spec_decoding,
      disagg: point.disagg,
      prefill_tp: point.prefill_tp,
      prefill_ep: point.prefill_ep,
      prefill_dp_attention: point.prefill_dp_attention,
      prefill_num_workers: point.prefill_num_workers,
      num_prefill_gpu: point.num_prefill_gpu,
      decode_tp: point.decode_tp,
      decode_ep: point.decode_ep,
      decode_dp_attention: point.decode_dp_attention,
      decode_num_workers: point.decode_num_workers,
      num_decode_gpu: point.num_decode_gpu,
      conc: point.conc,
      isl: sequence?.isl,
      osl: sequence?.osl,
      image: point.image,
    });
  }, [point, sequence?.isl, sequence?.osl, model]);

  const configJson = useMemo(() => {
    if (!point) return '';
    // Strip chart-only derived fields — keep the raw benchmark identity. This is
    // the JSON the user can copy and feed back as a future config diff input.
    const {
      x: _x,
      y: _y,
      hidden: _hidden,
      tpPerGpu: _tpg,
      tpPerMw: _tpm,
      outputTputPerGpu: _otg,
      inputTputPerGpu: _itg,
      outputTputPerMw: _otm,
      inputTputPerMw: _itm,
      costh: _ch,
      costn: _cn,
      costr: _cr,
      costhi: _chi,
      costni: _cni,
      costri: _cri,
      costhOutput: _cho,
      costnOutput: _cno,
      costrOutput: _cro,
      costUser: _cu,
      powerUser: _pu,
      jTotal: _jt,
      jOutput: _jo,
      jInput: _ji,
      ...essentials
    } = point;
    return JSON.stringify(essentials, null, 2);
  }, [point]);

  const runUrl = point?.run_url ? updateRepoUrl(point.run_url) : undefined;
  const hwLabel = useMemo(() => {
    if (!point) return '';
    try {
      return getDisplayLabel(getHardwareConfig(point.hwKey));
    } catch {
      return point.hwKey;
    }
  }, [point]);

  // Fire drawer-open analytics once per opened point.
  useEffect(() => {
    if (!point) return;
    track('reproduce_drawer_opened', {
      framework: point.framework,
      hwKey: point.hwKey,
      precision: point.precision,
      tp: point.tp,
      conc: point.conc,
      disagg: Boolean(point.disagg),
    });
  }, [point]);

  const copyTextForActiveTab = (): string => {
    if (!point) return '';
    if (activeTab === 'config') return configJson;
    if (activeTab === 'environment') {
      return [
        `GPU: ${hwLabel}`,
        `Framework: ${point.framework ?? '(unknown)'}`,
        point.precision ? `Precision: ${point.precision.toUpperCase()}` : '',
        point.image ? `Container image: ${point.image}` : '',
        point.spec_decoding && point.spec_decoding !== 'none'
          ? `Speculative decoding: ${point.spec_decoding}`
          : '',
        point.actualDate
          ? `Run date: ${point.actualDate}`
          : point.date
            ? `Run date: ${point.date}`
            : '',
        runUrl ? `Run URL: ${runUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (!launch) return '';
    if (launch.kind === 'single' && launch.command) return launch.command;
    if (launch.kind === 'disagg' && launch.commands) {
      return launch.commands.map((c) => `# ${c.label}\n${c.command}`).join('\n\n');
    }
    return launch.fallbackReason ?? '';
  };

  const handleCopy = async () => {
    if (!point) return;
    const text = copyTextForActiveTab();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be unavailable in non-secure contexts; tracking still useful.
    }
    track('reproduce_copy', {
      tab: activeTab,
      framework: point.framework,
      hwKey: point.hwKey,
      precision: point.precision,
      tp: point.tp,
      conc: point.conc,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="
          inset-x-0 bottom-0 top-auto left-auto translate-x-0 translate-y-0
          w-auto max-w-none h-auto max-h-[85vh]
          rounded-none rounded-t-lg border-t border-l-0 p-0
          grid-rows-[auto_auto_1fr] gap-0
          data-[state=open]:zoom-in-100! data-[state=closed]:zoom-out-100!
          data-[state=open]:slide-in-from-left-0! data-[state=open]:slide-in-from-bottom!
          data-[state=closed]:slide-out-to-left-0! data-[state=closed]:slide-out-to-bottom!
          sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:left-auto
          sm:w-[90vw] sm:max-w-3xl sm:h-screen sm:max-h-screen
          sm:rounded-none sm:border-l sm:border-t-0
          sm:data-[state=open]:slide-in-from-bottom-0! sm:data-[state=open]:slide-in-from-right!
          sm:data-[state=closed]:slide-out-to-bottom-0! sm:data-[state=closed]:slide-out-to-right!
        "
        data-testid="reproduce-drawer"
        aria-describedby={undefined}
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3 pr-10">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold">Reproduce this benchmark</DialogTitle>
            {point && (
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{hwLabel}</span>
                {' · '}
                <span>TP{point.tp}</span>
                {' · '}
                <span>conc {point.conc}</span>
                {' · '}
                <span className="uppercase">{point.precision}</span>
                {point.disagg && <span> · disagg</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
          <TabButton
            label="Command"
            active={activeTab === 'command'}
            onClick={() => setActiveTab('command')}
          />
          <TabButton
            label="Config JSON"
            active={activeTab === 'config'}
            onClick={() => setActiveTab('config')}
          />
          <TabButton
            label="Environment"
            active={activeTab === 'environment'}
            onClick={() => setActiveTab('environment')}
          />
          <div className="ml-auto flex items-center gap-1">
            {runUrl && (
              <a
                href={runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                onClick={() =>
                  track('reproduce_server_log_clicked', {
                    framework: point?.framework,
                    hwKey: point?.hwKey,
                  })
                }
                data-testid="reproduce-drawer-run-link"
              >
                Server log
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
            <CopyButton onCopy={handleCopy} testId="reproduce-drawer-copy" />
          </div>
        </div>

        <div className="overflow-auto px-4 py-3">
          {!point ? null : activeTab === 'command' ? (
            <CommandTab launch={launch} />
          ) : activeTab === 'config' ? (
            <CodeBlock value={configJson} language="json" />
          ) : (
            <EnvironmentTab point={point} hwLabel={hwLabel} runUrl={runUrl} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function CopyButton({ onCopy, testId }: { onCopy: () => void | Promise<void>; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await onCopy();
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
      data-testid={testId}
    >
      {copied ? (
        <>
          <Check className="size-3" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  );
}

function CommandTab({ launch }: { launch: ReturnType<typeof buildLaunchCommand> | null }) {
  if (!launch) return null;
  if (launch.kind === 'fallback') {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        <p className="font-medium uppercase tracking-wider">No launch command</p>
        <p className="mt-1 text-amber-700/90 dark:text-amber-300/90">{launch.fallbackReason}</p>
      </div>
    );
  }
  if (launch.kind === 'single' && launch.command) {
    return <CodeBlock value={launch.command} language="bash" />;
  }
  if (launch.kind === 'disagg' && launch.commands) {
    return (
      <div className="space-y-3">
        {launch.commands.map((cmd) => (
          <div key={cmd.label}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {cmd.label}
            </div>
            <CodeBlock value={cmd.command} language="bash" />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function EnvironmentTab({
  point,
  hwLabel,
  runUrl,
}: {
  point: InferenceData;
  hwLabel: string;
  runUrl?: string;
}) {
  const rows: { label: string; value: string | undefined }[] = [
    { label: 'GPU', value: hwLabel },
    { label: 'Framework', value: point.framework },
    {
      label: 'Precision',
      value: point.precision ? point.precision.toUpperCase() : undefined,
    },
    {
      label: 'Speculative decoding',
      value: point.spec_decoding && point.spec_decoding !== 'none' ? point.spec_decoding : 'none',
    },
    { label: 'Container image', value: point.image },
    {
      label: 'Run date',
      value: point.actualDate ?? point.date,
    },
    { label: 'Workflow run', value: runUrl },
  ];
  return (
    <dl className="space-y-2 text-xs">
      {rows.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-[140px_1fr] gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all font-mono">
            {value || <span className="italic text-muted-foreground">(not recorded)</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CodeBlock({ value, language: _language }: { value: string; language: 'bash' | 'json' }) {
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-[11px] leading-snug">
      {value}
    </pre>
  );
}
