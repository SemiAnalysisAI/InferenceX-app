import { lines } from './halo-archive';
import { haloRead, haloWrite } from './halo-state';
import { frontierPaths, liveCharts } from './halo-visor';

const chartEmpty = ':is([data-testid="chart-empty-state"], [data-testid="scatter-empty-state"])';
const chartLoading =
  '[data-testid="inference-chart-display"] [data-slot="card"] > [data-slot="skeleton"][class~="h-[600px]"]';
const stateSelector = `${chartEmpty}, ${chartLoading}`;
const phaseDuration = 3_200;

export const haloLineJournal = 'halo-comms-journal';
export const haloReconStage = 'halo-recon-stage';
export const canonicalLines = [
  'weapon',
  'bomb',
  'finish',
  'sleep',
  'started',
  'together',
  'promise',
  'wake',
] as const;
export type CanonicalLine = (typeof canonicalLines)[number];
const lastTransmission = new Map<CanonicalLine, number>();

export function recordHaloLine(line: CanonicalLine) {
  const now = Date.now();
  const previous = lastTransmission.get(line);
  if (previous !== undefined && now - previous < 20_000) return false;
  lastTransmission.set(line, now);
  const journal = haloRead(haloLineJournal, '').split(',').filter(Boolean);
  if (!journal.includes(line)) haloWrite(haloLineJournal, [...journal, line].join(','));
  return true;
}

function caption(line: CanonicalLine, zh: boolean) {
  const quote = document.createElement('span');
  quote.className = 'halo-event-quote no-export';
  quote.dataset.haloQuote = line;
  quote.setAttribute('role', 'status');
  const primary = document.createElement('span');
  primary.textContent = lines[line][zh ? 1 : 0];
  quote.append(primary);
  if (zh) {
    const original = document.createElement('small');
    original.lang = 'en';
    original.textContent = lines[line][0];
    quote.append(original);
  }
  return quote;
}

export function mountHaloTelemetry(zh: boolean) {
  const decorated = new Set<Element>();
  const chartStates = new Map<SVGSVGElement, { revision: string; timeout?: number }>();
  const captionTimers = new Map<Element, number>();
  const emptyConfirmations = new Map<HTMLElement, number>();
  const copy = (en: string, cn: string) => (zh ? cn : en);

  function lineNear(host: Element, line: CanonicalLine) {
    if (!recordHaloLine(line)) return;
    host.querySelector(':scope > .halo-event-quote')?.remove();
    const quote = caption(line, zh);
    host.append(quote);
    captionTimers.set(
      quote,
      window.setTimeout(() => {
        quote.remove();
        captionTimers.delete(quote);
      }, 5_250),
    );
  }

  function state(node: HTMLElement) {
    if (decorated.has(node)) return;
    decorated.add(node);
    const empty = node.matches(chartEmpty);
    const label = document.createElement('strong');
    label.className = 'halo-telemetry-status';
    label.dataset.haloTelemetryState = empty ? 'empty' : 'loading';
    label.textContent = empty
      ? copy('MOTION TRACKER · NO CONTACTS', '动态追踪器 · 未发现目标')
      : copy('MJOLNIR · ACQUIRING SIGNAL', '雷神之锤 · 正在捕获信号');
    node.prepend(label);
    if (empty) {
      const outsideSelection = !['hidden', 'clipped'].includes(node.dataset.reason ?? '');
      const objective = document.createElement('div');
      objective.className = 'halo-empty-objective';
      const art = document.createElement('img');
      art.src = '/decorative/halo/noble-six.webp';
      art.alt = '';
      art.width = 48;
      art.height = 30;
      const text = document.createElement('span');
      text.textContent = outsideSelection
        ? copy(
            'CURRENT OBJECTIVE: SURVIVE · 0 compatible benchmark runs. Try a wider filter.',
            '当前目标：生存 · 0 个匹配的基准测试。请放宽筛选条件。',
          )
        : copy(
            'CURRENT OBJECTIVE: SURVIVE · 0 visible runs on the visor.',
            '当前目标：生存 · 护目镜中有 0 个可见的基准测试。',
          );
      objective.append(art, text);
      node.append(objective);
      // Filter hydration can mount and immediately replace a provisional empty
      // card; only the stable result should use the caption's rate limit.
      emptyConfirmations.set(
        node,
        window.setTimeout(() => {
          emptyConfirmations.delete(node);
          if (node.isConnected && node.getClientRects().length > 0) lineNear(node, 'promise');
        }, 420),
      );
    }
  }

  function refresh() {
    for (const node of decorated) if (!node.isConnected) decorated.delete(node);
    document.querySelectorAll<HTMLElement>(stateSelector).forEach(state);
    const captureLoading = new URLSearchParams(window.location.search).has('halo-uplink-preview');
    for (const [node, status] of chartStates) {
      if (node.isConnected) continue;
      window.clearTimeout(status.timeout);
      chartStates.delete(node);
    }
    for (const chart of document.querySelectorAll<SVGSVGElement>(liveCharts)) {
      if (chart.closest('[id$="-export"]')) continue;
      const lane = chart.parentElement?.previousElementSibling;
      if (!(lane instanceof HTMLElement) || !lane.matches('.halo-chart-keel')) continue;
      const status = lane.querySelector('.halo-chart-uplink');
      if (!status) continue;
      const paths = chart.querySelectorAll(frontierPaths);
      if (paths.length === 0) continue;
      const revision = `${paths.length}/${paths.item(0)?.getAttribute('d')}/${paths.item(paths.length - 1)?.getAttribute('d')}`;
      const previous = chartStates.get(chart);
      if (previous?.revision === revision) continue;
      const next = { revision, timeout: previous?.timeout };
      chartStates.set(chart, next);
      window.clearTimeout(next.timeout);
      lane.dataset.haloUplink = captureLoading ? 'loading' : 'scanning';
      status.textContent = captureLoading
        ? copy('ACQUIRING SIGNAL', '正在捕获信号')
        : copy('RECALIBRATING', '重新校准中');
      if (captureLoading) continue;
      next.timeout = window.setTimeout(() => {
        delete lane.dataset.haloUplink;
        status.textContent = copy('TELEMETRY LOCKED', '遥测链路已锁定');
      }, phaseDuration);
    }
  }

  function exported() {
    // This native action fires after link.click(); other action emitters do
    // not have an active export snapshot with the Halo frame inside.
    const stamp = document.querySelector('[id$="-export"] .halo-export-stamp');
    const host = stamp?.closest('[id$="-export"]')?.closest('[data-testid="chart-figure"]');
    if (host) lineNear(host, 'bomb');
  }
  window.addEventListener('inferencex:action', exported);

  return {
    selector: stateSelector,
    refresh,
    close() {
      window.removeEventListener('inferencex:action', exported);
      for (const node of decorated)
        node
          .querySelectorAll(':scope > :is(.halo-telemetry-status,.halo-empty-objective)')
          .forEach((item) => item.remove());
      for (const { timeout } of chartStates.values()) window.clearTimeout(timeout);
      for (const timer of emptyConfirmations.values()) window.clearTimeout(timer);
      for (const [node, timer] of captionTimers) {
        window.clearTimeout(timer);
        node.remove();
      }
    },
  };
}
