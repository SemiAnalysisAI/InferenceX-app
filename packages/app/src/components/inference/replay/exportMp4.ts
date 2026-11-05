import type { ArrayBufferTarget as ArrayBufferTargetType, Muxer as MuxerType } from 'mp4-muxer';

import {
  drawExportFooter,
  getExportFooterStyle,
  type ExportFooterStyle,
} from '@/lib/export/export-footer';

export type Mp4ExportStage = 'init' | 'render' | 'encode' | 'flush' | 'mux';

export function isMp4ExportError(value: unknown): value is Mp4ExportError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'Mp4ExportError'
  );
}

export class Mp4ExportError extends Error {
  readonly stage: Mp4ExportStage;
  readonly encoderState: VideoEncoder['state'] | 'unknown';
  readonly queuedFrames: number;

  constructor(
    message: string,
    options: {
      stage: Mp4ExportStage;
      encoderState: VideoEncoder['state'] | 'unknown';
      queuedFrames: number;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'Mp4ExportError';
    this.stage = options.stage;
    this.encoderState = options.encoderState;
    this.queuedFrames = options.queuedFrames;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

interface ExportOptions {
  captureRoot: HTMLElement;
  renderFrame: (fraction: number) => Promise<void>;
  fileName: string;
  fps?: number;
  durationSec?: number;
  bitrate?: number;
  onProgress?: (fraction: number) => void;
  onStage?: (stage: Mp4ExportStage) => void;
  signal?: AbortSignal;
}

const CSS_VAR_RE = /var\(--(?<varName>[^)]+)\)/u;
const WATERMARK_HEIGHT = 48;

function resolveCssVarsForExport(root: HTMLElement) {
  const rootStyles = getComputedStyle(document.documentElement);

  function resolve(raw: string): string {
    let resolved = raw;
    let match: RegExpExecArray | null;
    while ((match = CSS_VAR_RE.exec(resolved)) !== null) {
      const computed = rootStyles.getPropertyValue(`--${match[1]}`).trim();
      const next = resolved.replace(match[0], computed || match[0]);
      if (next === resolved) break;
      resolved = next;
    }
    return resolved;
  }

  const PRESENTATION_ATTRS = ['fill', 'stroke', 'color', 'stop-color'];
  for (const el of [...root.querySelectorAll('svg, svg *')] as SVGElement[]) {
    for (const attr of PRESENTATION_ATTRS) {
      const val = el.getAttribute(attr);
      if (val && CSS_VAR_RE.test(val)) el.setAttribute(attr, resolve(val));
    }
    for (const prop of el.style) {
      const val = el.style.getPropertyValue(prop);
      if (val && CSS_VAR_RE.test(val)) el.style.setProperty(prop, resolve(val));
    }
  }

  const COMPUTED_SELECTORS: { selector: string; attr: string; cssProp: string }[] = [
    { selector: '.chart-root .grid line', attr: 'stroke', cssProp: 'stroke' },
    { selector: '.chart-root .x-axis .domain', attr: 'stroke', cssProp: 'stroke' },
    { selector: '.chart-root .y-axis .domain', attr: 'stroke', cssProp: 'stroke' },
    { selector: '.chart-root .tick line', attr: 'stroke', cssProp: 'stroke' },
    { selector: '.chart-root .tick text', attr: 'fill', cssProp: 'fill' },
    { selector: '.x-axis-label, .y-axis-label', attr: 'fill', cssProp: 'fill' },
  ];
  for (const { selector, attr, cssProp } of COMPUTED_SELECTORS) {
    for (const el of [...root.querySelectorAll(selector)] as SVGElement[]) {
      const current = el.getAttribute(attr);
      if (!current || CSS_VAR_RE.test(current)) {
        const computed = getComputedStyle(el).getPropertyValue(cssProp);
        if (computed) el.setAttribute(attr, computed.trim());
      }
    }
  }
}

function bakeTextColorsFromLive(liveRoot: HTMLElement, cloneRoot: HTMLElement) {
  const liveEls = [
    liveRoot,
    ...liveRoot.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, span, label, button'),
  ];
  const cloneEls = [
    cloneRoot,
    ...cloneRoot.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, span, label, button'),
  ];
  const len = Math.min(liveEls.length, cloneEls.length);
  for (let i = 0; i < len; i++) {
    const liveStyle = getComputedStyle(liveEls[i]);
    const c = cloneEls[i];
    if (liveStyle.color) c.style.color = liveStyle.color;
  }
}

function expandLegendForExport(cloneRoot: HTMLElement) {
  const legend = cloneRoot.querySelector<HTMLElement>('[data-testid="replay-legend"]');
  if (legend) {
    const scrollHost = legend.parentElement;
    if (scrollHost) {
      scrollHost.style.maxHeight = 'none';
      scrollHost.style.overflow = 'visible';
      scrollHost.style.height = 'auto';
    }
  }
}

const skipNoExport = (node: Node) =>
  !((node as Element).classList && (node as Element).classList.contains('no-export'));

function drawWithWatermark(
  source: HTMLCanvasElement,
  bgColor: string,
  footerStyle: ExportFooterStyle,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height + WATERMARK_HEIGHT;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  drawExportFooter(ctx, footerStyle, out.width, source.height, WATERMARK_HEIGHT, 16);
  return out;
}

export async function exportReplayMp4(opts: ExportOptions): Promise<void> {
  const {
    captureRoot: livePanel,
    renderFrame,
    fileName,
    fps = 30,
    durationSec = 6,
    bitrate = 6_000_000,
    onProgress,
    onStage,
    signal,
  } = opts;

  let stage: Mp4ExportStage = 'init';
  const advanceStage = (next: Mp4ExportStage) => {
    if (stage === next) return;
    stage = next;
    onStage?.(next);
  };

  const throwIfAborted = () => {
    if (signal?.aborted) {
      const err = new Error('Export cancelled');
      err.name = 'AbortError';
      throw err;
    }
  };

  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new TypeError('WebCodecs is not available in this browser. Try Chrome.');
  }

  if (!livePanel.isConnected) {
    throw new Error('Replay panel element is not in the DOM.');
  }

  const [{ Muxer, ArrayBufferTarget }, { toCanvas }] = await Promise.all([
    import('mp4-muxer'),
    import('@jpinsonneau/html-to-image'),
  ]);

  const liveRect = livePanel.getBoundingClientRect();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'pointer-events:none',
    'opacity:0',
    `width:${Math.ceil(liveRect.width)}px`,
  ].join(';');
  document.body.append(host);

  const bgColor =
    getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#fff';
  const footerStyle = getExportFooterStyle(livePanel);

  let outWidth = 0;
  let outHeight = 0;
  let muxer: MuxerType<ArrayBufferTargetType> | null = null;
  let encoder: VideoEncoder | null = null;
  const totalFrames = Math.max(2, Math.floor(durationSec * fps));

  const encoderErrorBox: {
    current: Error | null;
    snapshot: { encoderState: VideoEncoder['state'] | 'unknown'; queuedFrames: number } | null;
  } = { current: null, snapshot: null };
  let muxerFinalized = false;

  const failureSnapshot = () =>
    encoderErrorBox.snapshot ?? {
      encoderState: encoder?.state ?? ('unknown' as const),
      queuedFrames: encoder?.encodeQueueSize ?? 0,
    };

  try {
    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted();
      if (encoderErrorBox.current !== null) {
        const err = encoderErrorBox.current;
        throw new Mp4ExportError(err.message, {
          stage,
          ...failureSnapshot(),
          cause: err,
        });
      }
      const t = totalFrames === 1 ? 1 : i / (totalFrames - 1);
      advanceStage('render');
      await renderFrame(t);

      host.replaceChildren();
      const clone = livePanel.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      clone.style.width = `${Math.ceil(liveRect.width)}px`;
      host.append(clone);
      bakeTextColorsFromLive(livePanel, clone);
      expandLegendForExport(clone);
      resolveCssVarsForExport(clone);

      for (const el of clone.querySelectorAll<HTMLElement>('.no-export')) {
        el.style.display = 'none';
      }

      const legendContainer = clone.querySelector<HTMLElement>('[data-testid="chart-legend"]');
      if (legendContainer) {
        const scrollContainer =
          legendContainer.querySelector<HTMLElement>('ul, [class*="overflow"]');
        if (scrollContainer) {
          const sibling = scrollContainer.nextElementSibling as HTMLElement | null;
          const hasVisibleControls =
            sibling &&
            sibling.style.display !== 'none' &&
            [...sibling.children].some((child) => (child as HTMLElement).style.display !== 'none');
          if (!hasVisibleControls) {
            scrollContainer.style.borderBottom = 'none';
            scrollContainer.style.paddingBottom = '0';
          }
        }
      }

      const captured = await toCanvas(clone, {
        pixelRatio: 1,
        cacheBust: false,
        backgroundColor: bgColor,
        filter: skipNoExport,
      });

      const watermarked = drawWithWatermark(captured, bgColor, footerStyle);

      if (i === 0) {
        outWidth = Math.max(2, Math.ceil(watermarked.width / 2) * 2);
        outHeight = Math.max(2, Math.ceil(watermarked.height / 2) * 2);
        const newMuxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: 'avc', width: outWidth, height: outHeight },
          fastStart: 'in-memory',
        });
        // oxlint-disable-next-line no-loop-func
        const newEncoder = new VideoEncoder({
          // oxlint-disable-next-line no-loop-func
          output: (chunk, meta) => {
            advanceStage('mux');
            newMuxer.addVideoChunk(chunk, meta);
          },
          // oxlint-disable-next-line no-loop-func
          error: (e: unknown) => {
            encoderErrorBox.current = e instanceof Error ? e : new Error(String(e));
            encoderErrorBox.snapshot = {
              encoderState: newEncoder.state,
              queuedFrames: newEncoder.encodeQueueSize,
            };
          },
        });
        newEncoder.configure({
          codec: 'avc1.640028',
          width: outWidth,
          height: outHeight,
          bitrate,
          framerate: fps,
        });
        muxer = newMuxer;
        encoder = newEncoder;
      }

      const fit = document.createElement('canvas');
      fit.width = outWidth;
      fit.height = outHeight;
      const fctx = fit.getContext('2d');
      if (!fctx) throw new Error('Could not allocate frame canvas');
      fctx.fillStyle = bgColor;
      fctx.fillRect(0, 0, outWidth, outHeight);
      const drawW = Math.min(watermarked.width, outWidth);
      const drawH = Math.min(watermarked.height, outHeight);
      const srcX = Math.floor((watermarked.width - drawW) / 2);
      const srcY = Math.floor((watermarked.height - drawH) / 2);
      const dstX = Math.floor((outWidth - drawW) / 2);
      const dstY = Math.floor((outHeight - drawH) / 2);
      fctx.drawImage(watermarked, srcX, srcY, drawW, drawH, dstX, dstY, drawW, drawH);

      const frame = new VideoFrame(fit, {
        timestamp: Math.round((i / fps) * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      advanceStage('encode');
      encoder!.encode(frame, { keyFrame: i % fps === 0 });
      frame.close();

      onProgress?.(i / (totalFrames - 1));
    }

    if (!muxer || !encoder) {
      throw new Mp4ExportError('Encoder was never initialized.', { stage, ...failureSnapshot() });
    }
    advanceStage('flush');
    await Promise.race([
      encoder.flush(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Encoder flush timed out after 30s.')), 30_000);
      }),
    ]);
    if (encoderErrorBox.current !== null) {
      const err = encoderErrorBox.current;
      throw new Mp4ExportError(err.message, {
        stage,
        ...failureSnapshot(),
        cause: err,
      });
    }
    encoder.close();
    advanceStage('mux');
    muxer.finalize();
    muxerFinalized = true;

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}-${Date.now()}.mp4`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onProgress?.(1);
  } catch (error) {
    if (error instanceof Mp4ExportError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Mp4ExportError(message, { stage, ...failureSnapshot(), cause: error });
  } finally {
    if (encoder && encoder.state !== 'closed') {
      try {
        encoder.close();
      } catch {}
    }
    if (muxer && !muxerFinalized) {
      try {
        muxer.finalize();
      } catch {}
    }
    host.remove();
  }
}
