'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

import { SLA_EXAMPLE_TARGETS, type SlaTargets } from '@semianalysisai/inferencex-constants';

import { ControlPanel } from '@/components/ui/control-panel';
import { DisclosureToggle } from '@/components/ui/disclosure-toggle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';
import { SLA_AGENTIC_WORKLOAD } from '@/lib/sla-targets/dataset';
import { SLA_MAX_TARGET_MS } from '@/lib/sla-targets/evaluation';
import {
  attainmentFraction,
  attainmentPercent,
  parseTargetInput,
  SLA_ATTAINMENT_PERCENT_RANGE,
  type SlaCostTier,
} from '@/lib/sla-targets/state';

import type { SlaStrings } from './sla-strings';

/**
 * One clause of the targets sentence: words, a free numeric field, its unit.
 * The typed text is kept as typed; a value is committed only when `parse`
 * accepts it, and is never rounded or snapped. With `optional`, an empty field
 * commits `null`: no limit.
 */
function TargetClause({
  id,
  before,
  unit,
  after,
  value,
  parse,
  optional = false,
  placeholder,
  invalidLabel,
  onCommit,
  testId,
}: {
  id: string;
  before: string;
  unit: string;
  after?: string;
  value: number | null;
  parse: (raw: string) => number | null;
  optional?: boolean;
  placeholder?: string;
  invalidLabel: string;
  onCommit: (value: number | null) => void;
  testId: string;
}) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const read = (raw: string): number | null | undefined =>
    optional && raw.trim() === '' ? null : (parse(raw) ?? undefined);
  useEffect(() => {
    // Keep what was typed ("1000.0") while it still means the committed value.
    setText((current) => {
      const parsed = optional && current.trim() === '' ? null : parse(current);
      return parsed === value ? current : shown;
    });
  }, [value, shown, optional, parse]);
  const invalid = read(text) === undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Label htmlFor={id} className="font-normal whitespace-nowrap">
          {before}
        </Label>
        <span className="flex shrink-0 items-center gap-1.5">
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            aria-invalid={invalid}
            aria-describedby={cn(`${id}-unit`, invalid && `${id}-error`)}
            data-testid={testId}
            className="w-20 px-2 text-center font-medium tabular-nums md:w-24 md:px-3"
            onChange={(event) => {
              setText(event.target.value);
              const parsed = read(event.target.value);
              if (parsed !== undefined) onCommit(parsed);
            }}
            onBlur={() => {
              if (read(text) === undefined) setText(shown);
            }}
          />
          <span id={`${id}-unit`} className="text-sm whitespace-nowrap">
            {unit}
            {after ? ` ${after}` : ''}
          </span>
        </span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {invalidLabel}
        </p>
      )}
    </div>
  );
}

const parseLatencyMs = (raw: string) => parseTargetInput(raw, SLA_MAX_TARGET_MS);
const parseLatencyS = (raw: string) => parseTargetInput(raw, SLA_MAX_TARGET_MS / 1000);

/** A required share in percent, inside the supported range; `null` for anything else. */
function parseSharePercent(raw: string): number | null {
  const percent = Number(raw);
  const { min, max } = SLA_ATTAINMENT_PERCENT_RANGE;
  return raw.trim() !== '' && percent >= min && percent <= max
    ? attainmentPercent(attainmentFraction(percent))
    : null;
}

/**
 * The targets as one sentence with three fields. The end-to-end limit is
 * optional and sits under "More"; when it is set, the collapsed control says so.
 */
export function SlaTargetInputs({
  t,
  targets,
  onTargetsChange,
}: {
  t: SlaStrings;
  targets: SlaTargets;
  onTargetsChange: (targets: SlaTargets) => void;
}) {
  const id = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const isExample =
    targets.maxTtftMs === SLA_EXAMPLE_TARGETS.maxTtftMs &&
    targets.maxTpotMs === SLA_EXAMPLE_TARGETS.maxTpotMs &&
    targets.requiredAttainment === SLA_EXAMPLE_TARGETS.requiredAttainment &&
    targets.maxE2eS === null;
  return (
    <ControlPanel
      legend={t.targetsLegend}
      data-testid="sla-controls"
      className="grid-cols-1 gap-y-3 pt-2"
    >
      <div className="flex flex-col gap-x-5 gap-y-3 md:flex-row md:flex-wrap md:items-start">
        <TargetClause
          id={`${id}-ttft`}
          before={t.ttftClause.before}
          unit={t.ttftClause.unit}
          value={targets.maxTtftMs}
          parse={parseLatencyMs}
          invalidLabel={t.invalidTarget}
          testId="sla-ttft-input"
          onCommit={(maxTtftMs) => {
            if (maxTtftMs !== null) onTargetsChange({ ...targets, maxTtftMs });
          }}
        />
        <TargetClause
          id={`${id}-tpot`}
          before={t.tpotClause.before}
          unit={t.tpotClause.unit}
          value={targets.maxTpotMs}
          parse={parseLatencyMs}
          invalidLabel={t.invalidTarget}
          testId="sla-tpot-input"
          onCommit={(maxTpotMs) => {
            if (maxTpotMs !== null) onTargetsChange({ ...targets, maxTpotMs });
          }}
        />
        <TargetClause
          id={`${id}-attainment`}
          before={t.shareClause.before}
          unit={t.shareClause.unit}
          after={t.shareClause.after}
          value={attainmentPercent(targets.requiredAttainment)}
          parse={parseSharePercent}
          invalidLabel={t.invalidShare}
          testId="sla-attainment-input"
          onCommit={(percent) => {
            if (percent !== null) {
              onTargetsChange({ ...targets, requiredAttainment: attainmentFraction(percent) });
            }
          }}
        />
        <DisclosureToggle
          open={moreOpen}
          aria-controls={`${id}-more`}
          data-testid="sla-more-toggle"
          className="self-start text-sm md:h-9"
          onClick={() => {
            setMoreOpen(!moreOpen);
            track('sla_targets_more_toggled', { enabled: !moreOpen });
          }}
        >
          {t.more}
          {!moreOpen && targets.maxE2eS !== null && (
            <span className="text-foreground" data-testid="sla-more-active">
              {t.moreActive(String(targets.maxE2eS))}
            </span>
          )}
        </DisclosureToggle>
        {moreOpen && (
          <div id={`${id}-more`} className="md:basis-full" data-testid="sla-more-panel">
            <TargetClause
              id={`${id}-e2e`}
              before={t.e2eClause.before}
              unit={t.e2eClause.unit}
              value={targets.maxE2eS}
              parse={parseLatencyS}
              optional
              placeholder={t.e2eClause.placeholder}
              invalidLabel={t.invalidTarget}
              testId="sla-e2e-input"
              onCommit={(maxE2eS) => {
                if ((maxE2eS === null) !== (targets.maxE2eS === null)) {
                  track('sla_targets_e2e_toggled', { enabled: maxE2eS !== null });
                }
                onTargetsChange({ ...targets, maxE2eS });
              }}
            />
          </div>
        )}
      </div>
      {isExample && (
        <p className="text-xs text-muted-foreground" data-testid="sla-example-note">
          {t.exampleNote}
        </p>
      )}
    </ControlPanel>
  );
}

function DataSelect({
  id,
  label,
  value,
  onValueChange,
  testId,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} size="sm" data-testid={testId} className="w-full md:w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

/** Which results are evaluated and how they are priced. Secondary to the targets. */
export function SlaDataSelectors({
  t,
  models,
  model,
  workloads,
  workload,
  costTier,
  onModelChange,
  onWorkloadChange,
  onCostTierChange,
}: {
  t: SlaStrings;
  models: string[];
  model: string;
  workloads: string[];
  workload: string;
  costTier: SlaCostTier;
  onModelChange: (model: string) => void;
  onWorkloadChange: (workload: string) => void;
  onCostTierChange: (tier: SlaCostTier) => void;
}) {
  const id = useId();
  const workloadLabel = (value: string) =>
    value === SLA_AGENTIC_WORKLOAD ? t.workloadAgentic : t.workloadFixed(value);
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-wrap md:items-end"
      data-testid="sla-data-selectors"
    >
      <DataSelect
        id={`${id}-model`}
        label={t.model}
        value={model}
        testId="sla-model-select"
        onValueChange={(next) => {
          onModelChange(next);
          track('sla_targets_model_changed', { model: next });
        }}
      >
        {models.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </DataSelect>
      {workloads.length > 1 && (
        <DataSelect
          id={`${id}-workload`}
          label={t.workload}
          value={workload}
          testId="sla-workload-select"
          onValueChange={(next) => {
            onWorkloadChange(next);
            track('sla_targets_workload_changed', { workload: next });
          }}
        >
          {workloads.map((option) => (
            <SelectItem key={option} value={option}>
              {workloadLabel(option)}
            </SelectItem>
          ))}
        </DataSelect>
      )}
      <DataSelect
        id={`${id}-cost`}
        label={t.costBasis}
        value={costTier}
        testId="sla-cost-select"
        onValueChange={(next) => {
          onCostTierChange(next as SlaCostTier);
          track('sla_targets_cost_basis_changed', { cost_basis: next });
        }}
      >
        <SelectItem value="hyperscaler">{t.costHyperscaler}</SelectItem>
        <SelectItem value="rental">{t.costRental}</SelectItem>
      </DataSelect>
    </div>
  );
}
