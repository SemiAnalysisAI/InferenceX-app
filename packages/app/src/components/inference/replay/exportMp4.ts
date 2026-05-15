import type { ArrayBufferTarget as ArrayBufferTargetType, Muxer as MuxerType } from 'mp4-muxer';

export type Mp4ExportStage = 'init' | 'render' | 'encode' | 'flush' | 'mux';

// Brand check on the `name` field — `instanceof` is unreliable here because
// `exportMp4.ts` is dynamically imported, so the class identity can differ
// between the caller's static type-only import and the runtime instance.
export function isMp4ExportError(value: unknown): value is Mp4ExportError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'Mp4ExportError'
  );
}

/** Stage-tagged error thrown by exportReplayMp4; lets the caller attribute failures to the actual pipeline phase. */
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
    // tsconfig target is ES2017 — Error's options-arg form is ES2022, so the
    // manual assignment is still required to preserve `cause`.
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

interface ExportOptions {
  /** Live replay panel element captured each frame. Must be in the DOM. */
  captureRoot: HTMLElement;
  /**
   * Advance the replay to the given fraction [0, 1] and resolve once the new
   * frame has been painted. Called once per output frame. The caller is
   * responsible for flushing React state and waiting for paint.
   */
  renderFrame: (fraction: number) => Promise<void>;
  fileName: string;
  fps?: number;
  durationSec?: number;
  bitrate?: number;
  onProgress?: (fraction: number) => void;
  /** Fires when the pipeline advances stages, so callers can record where a failure happened. */
  onStage?: (stage: Mp4ExportStage) => void;
  /** Aborting before completion throws an AbortError without writing the file. */
  signal?: AbortSignal;
}

const CSS_VAR_RE = /var\(--([^)]+)\)/u;
const WATERMARK_HEIGHT = 48;
const WATERMARK_TEXT = 'InferenceX — github.com/SemiAnalysisAI/InferenceX';

// Mutates the supplied root in place — call only on a clone; baking onto the
// live panel would freeze it on current theme.
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

// html-to-image can't resolve var(--*) tokens used by Tailwind text utilities,
// so bake live computed colors onto the clone.
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

// Drop the live `max-h-[480px] overflow-y-auto` wrapper so every legend item
// appears in the rasterized frame.
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

/** Draw the panel canvas onto a slightly taller canvas with an InferenceX watermark bar. */
function drawWithWatermark(
  source: HTMLCanvasElement,
  bgColor: string,
  isDark: boolean,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height + WATERMARK_HEIGHT;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.fillStyle = bgColor || (isDark ? '#0a0a0a' : '#ffffff');
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = isDark ? '#1a1a2e' : '#f5f5f5';
  ctx.fillRect(0, source.height, out.width, WATERMARK_HEIGHT);
  ctx.fillStyle = isDark ? '#aaa' : '#555';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(WATERMARK_TEXT, out.width / 2, source.height + WATERMARK_HEIGHT / 2);
  return out;
}

// Per-frame: caller advances replay → clone live panel → bake colors → toCanvas → encode.
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

  // Off-screen host: kept positioned far off-canvas (not display:none, because
  // html-to-image needs computed styles to be available).
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
  const isDark =
    document.documentElement.classList.contains('dark') ||
    document.documentElement.classList.contains('minecraft');

  let outWidth = 0;
  let outHeight = 0;
  let muxer: MuxerType<ArrayBufferTargetType> | null = null;
  let encoder: VideoEncoder | null = null;
  const totalFrames = Math.max(2, Math.floor(durationSec * fps));

  // Captured so a VideoEncoder error callback (which can fire at any point
  // during encode/flush) surfaces as a checkable error instead of an
  // un-awaitable throw from inside an async callback. Boxed so TS doesn't
  // narrow the field to `never` — the only write is inside a callback TS
  // can't see firing. The snapshot captures encoder state at the *moment*
  // the error fires; reading it lazily after `close()` reports `closed`/0,
  // hiding the actual back-pressure that caused the failure.
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

      // Per-frame clone: React commits new dot positions on the live SVG, so a
      // deep clone each frame captures the current state.
      host.replaceChildren();
      const clone = livePanel.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      clone.style.width = `${Math.ceil(liveRect.width)}px`;
      host.append(clone);
      bakeTextColorsFromLive(livePanel, clone);
      expandLegendForExport(clone);
      resolveCssVarsForExport(clone);

      // Collapse .no-export boxes entirely. html-to-image's `filter` skips
      // rendering, but the cloned nodes still take layout space — leaving
      // dead space below the chart (controls bar) and inside the legend
      // (search input, switches, action links). Matches the PNG export path.
      for (const el of clone.querySelectorAll<HTMLElement>('.no-export')) {
        el.style.display = 'none';
      }

      // Legend scroll container has a `border-b` divider that only makes sense
      // when the bottom controls below it are visible; with .no-export gone
      // the line dangles, so strip it once nothing visible remains below.
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

      const watermarked = drawWithWatermark(captured, bgColor, isDark);

      // Lock encoder dimensions to the first watermarked frame and pad/crop
      // subsequent frames to match (small reflow noise can shift the captured
      // size by a pixel or two; H.264 needs stable dims).
      if (i === 0) {
        // Round UP to the nearest even pixel and letterbox into the resulting
        // canvas. Rounding down silently crops the rightmost/bottom pixel
        // column of the watermark on odd dimensions (e.g. 1281 → 1280).
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
            // Flip stage on the first chunk the encoder hands us: this is the
            // earliest point where a muxer-thrown error would be attributable
            // to muxing, not encoding. Without this, any throw from
            // addVideoChunk surfaces while stage is still 'encode'.
            advanceStage('mux');
            newMuxer.addVideoChunk(chunk, meta);
          },
          // oxlint-disable-next-line no-loop-func
          error: (e: unknown) => {
            encoderErrorBox.current = e instanceof Error ? e : new Error(String(e));
            // Snapshot synchronously: by the time the catch runs we may
            // have already closed the encoder, hiding the back-pressure.
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
      // Centre into the fixed encoder canvas instead of anchoring to (0,0).
      // outW/outH are ceiled from frame 0, so subsequent frames are usually
      // ≤ that size — letterbox bars fill with bgColor. If reflow noise
      // pushes a frame larger, the source rect crops symmetrically rather
      // than dropping the right/bottom edge.
      const drawW = Math.min(watermarked.width, outWidth);
      const drawH = Math.min(watermarked.height, outHeight);
      const srcX = Math.floor((watermarked.width - drawW) / 2);
      const srcY = Math.floor((watermarked.height - drawH) / 2);
      const dstX = Math.floor((outWidth - drawW) / 2);
      const dstY = Math.floor((outHeight - drawH) / 2);
      fctx.drawImage(watermarked, srcX, srcY, drawW, drawH, dstX, dstY, drawW, drawH);

      // mp4-muxer rejects null durations on encoded chunks; WebCodecs leaves
      // `duration` unset on VideoFrame unless we pass it through here.
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
    // Revoking synchronously races Chromium's async download dispatch — the
    // blob URL is freed before the browser reads it, so the file lands as the
    // bare blob UUID with no extension. Defer until the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onProgress?.(1);
  } catch (error) {
    if (error instanceof Mp4ExportError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Mp4ExportError(message, { stage, ...failureSnapshot(), cause: error });
  } finally {
    // VideoEncoder is a native resource — relying on GC orphans GPU/codec
    // slots on error paths (esp. flush timeout, which throws but leaves the
    // encoder still draining).
    if (encoder && encoder.state !== 'closed') {
      try {
        encoder.close();
      } catch {
        // Some Chromium builds throw on double-close; swallow.
      }
    }
    // Double-finalize corrupts the MP4 box structure; only finalize here on
    // error paths where the muxer was constructed but never reached the
    // happy-path finalize.
    if (muxer && !muxerFinalized) {
      try {
        muxer.finalize();
      } catch {
        // Best-effort cleanup; nothing to surface to the caller.
      }
    }
    host.remove();
  }
}
