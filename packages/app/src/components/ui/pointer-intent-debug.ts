import {
  POINTER_INTENT_TUNING as T,
  projectPointer,
  setPointerIntentDebug,
  watchedElements,
} from '@/components/ui/pointer-intent';

const HIT_FADE_MS = 1500;
const MAX_LOG = 14;

let mounted = false;

const hrefOf = (element: Element) => element.getAttribute('href') ?? '?';
const pathOf = (url: string) => {
  const u = new URL(url, location.href);
  u.searchParams.delete('_rsc');
  return u.pathname + u.search;
};

export function mountPointerIntentDebug() {
  if (mounted || typeof window === 'undefined') return;
  mounted = true;

  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483646',
  });
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    width: '520px',
    padding: '8px 10px',
    font: '11px/1.45 ui-monospace, monospace',
    color: '#e5e7eb',
    background: 'rgba(10,10,10,0.85)',
    border: '1px solid #333',
    borderRadius: '6px',
    pointerEvents: 'none',
    zIndex: '2147483647',
    whiteSpace: 'pre',
  });
  document.body.append(canvas, panel);
  const ctx = canvas.getContext('2d')!;

  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  };
  resize();
  addEventListener('resize', resize);

  const samples: { x: number; y: number; t: number }[] = [];
  const hits: { element: Element; at: number }[] = [];
  const predictedAt = new Map<string, number>();
  const log: string[] = [];
  const t0 = performance.now();
  const stamp = () => `${((performance.now() - t0) / 1000).toFixed(3).padStart(8)}s`;
  const push = (line: string) => {
    log.push(`${stamp()}  ${line}`);
    if (log.length > MAX_LOG) log.shift();
    panel.textContent = `cursor prefetch debug  lookahead ${T.LOOKAHEAD_MS}ms  max ${T.MAX_PROJECTION_PX}px  min ${T.MIN_SPEED_PX_PER_MS}px/ms\n${log.join('\n')}`;
  };
  push('ready');

  setPointerIntentDebug((element) => {
    const href = hrefOf(element);
    predictedAt.set(href, performance.now());
    hits.push({ element, at: performance.now() });
    push(`🎯 predicted  ${href}`);
  });

  addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
      while (samples.length > 2 && event.timeStamp - samples[0]!.t > T.SAMPLE_WINDOW_MS)
        samples.shift();
    },
    { passive: true },
  );

  addEventListener(
    'mouseover',
    (event) => {
      const a = (event.target as Element | null)?.closest?.('a[href]');
      if (a && !(event.relatedTarget as Element | null)?.closest?.('a[href]')?.isSameNode(a)) {
        const p = predictedAt.get(hrefOf(a));
        push(
          `🖱  hover      ${hrefOf(a)}${p ? `  (${Math.round(performance.now() - p)}ms after prediction)` : ''}`,
        );
      }
    },
    true,
  );

  addEventListener(
    'pointerdown',
    (event) => {
      const a = (event.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const p = predictedAt.get(hrefOf(a));
      push(
        `👆 click      ${hrefOf(a)}${p ? `  (${Math.round(performance.now() - p)}ms after prediction)` : '  (never predicted)'}`,
      );
    },
    true,
  );

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const isRsc = headers.has('rsc') || url.includes('_rsc=');
    if (!isRsc) return realFetch(input, init);
    const kind = headers.has('next-router-prefetch') ? '⬇ prefetch ' : '⇢ nav fetch';
    const start = performance.now();
    push(`${kind}  ${pathOf(url)}  start`);
    const res = await realFetch(input, init);
    res
      .clone()
      .arrayBuffer()
      .then((buf) =>
        push(
          `${kind}  ${pathOf(url)}  done ${Math.round(performance.now() - start)}ms ${(buf.byteLength / 1024).toFixed(1)}KB`,
        ),
      )
      .catch(() => {});
    return res;
  };

  const draw = () => {
    const now = performance.now();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148,163,184,0.7)';
    for (const element of watchedElements()) {
      const r = element.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const s = T.HIT_SLOP_PX;
      ctx.strokeRect(r.left - s, r.top - s, r.width + 2 * s, r.height + 2 * s);
    }
    ctx.setLineDash([]);

    for (let i = hits.length - 1; i >= 0; i--) {
      const age = now - hits[i]!.at;
      if (age > HIT_FADE_MS) {
        hits.splice(i, 1);
        continue;
      }
      const alpha = 1 - age / HIT_FADE_MS;
      const r = hits[i]!.element.getBoundingClientRect();
      ctx.fillStyle = `rgba(34,197,94,${0.35 * alpha})`;
      ctx.strokeStyle = `rgba(34,197,94,${alpha})`;
      ctx.lineWidth = 2;
      ctx.fillRect(r.left, r.top, r.width, r.height);
      ctx.strokeRect(r.left, r.top, r.width, r.height);
    }

    const last = samples.at(-1);
    const first = samples[0];
    if (last && first) {
      ctx.fillStyle = 'rgba(250,204,21,0.9)';
      for (const s of samples) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const dt = last.t - first.t;
      const end = projectPointer(samples);
      if (dt > 0 && now - last.t < 150) {
        const speed = Math.hypot(last.x - first.x, last.y - first.y) / dt;
        if (end) {
          ctx.strokeStyle = 'rgba(59,130,246,0.95)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(`${speed.toFixed(2)} px/ms`, last.x + 10, last.y - 10);
      }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
