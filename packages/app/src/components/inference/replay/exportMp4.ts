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
}

const CSS_VAR_RE = /var\(--([^)]+)\)/u;
const WATERMARK_HEIGHT = 48;
const WATERMARK_TEXT = 'InferenceX — github.com/SemiAnalysisAI/InferenceX';

/**
 * Bake `var(--*)` references inside an SVG subtree into resolved colors.
 * Mutates the supplied root in place — must only be called on a clone, never
 * on the live panel (otherwise the live UI would be stuck on baked colors and
 * stop responding to theme switches after an export).
 */
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

/**
 * Copy each live element's computed text color onto the matching clone element
 * as an inline style. html-to-image can't resolve `var(--muted-foreground)` and
 * similar tokens used by Tailwind text utilities, so we bake the resolved
 * colors directly. Mutates only the clone tree.
 */
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

/**
 * Unconstrain the legend's outer scroll viewport so every item appears in the
 * rasterized frame. The mini legend itself is already compact — we just need
 * to drop the `max-h-[480px] overflow-y-auto` wrapper that engages scroll in
 * the live preview.
 */
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

interface MuxerLike {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  finalize(): void;
  target: { buffer: ArrayBuffer };
}

/**
 * Render the replay timeline to MP4 (H.264) using WebCodecs + mp4-muxer.
 *
 * Per-frame "screenshot mode" capture: the live panel is cloned into an
 * off-screen container, no-export controls are filtered out, CSS variables
 * and computed text colors are baked onto the clone, the SVG is re-cloned
 * each frame from the live chart so position mutations land in the export,
 * and the final canvas is stamped with the InferenceX watermark bar.
 *
 * Crucially the LIVE panel is never modified — the user-visible UI keeps its
 * normal interactive look while the encode loop runs against the clone.
 *
 * Falls back with a clear error when WebCodecs is unavailable (mainly Firefox
 * without the experimental flag).
 */
export async function exportReplayMp4(opts: ExportOptions): Promise<void> {
  const {
    captureRoot: livePanel,
    renderFrame,
    fileName,
    fps = 30,
    durationSec = 6,
    bitrate = 6_000_000,
    onProgress,
  } = opts;

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
  let muxer: MuxerLike | null = null;
  let encoder: VideoEncoder | null = null;
  const totalFrames = Math.max(2, Math.floor(durationSec * fps));

  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = totalFrames === 1 ? 1 : i / (totalFrames - 1);
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
        outWidth = Math.max(2, Math.floor(watermarked.width / 2) * 2);
        outHeight = Math.max(2, Math.floor(watermarked.height / 2) * 2);
        const newMuxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: 'avc', width: outWidth, height: outHeight },
          fastStart: 'in-memory',
        }) as unknown as MuxerLike;
        const newEncoder = new VideoEncoder({
          output: (chunk, meta) => newMuxer.addVideoChunk(chunk, meta),
          error: (e) => {
            throw e;
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
      fctx.drawImage(
        watermarked,
        0,
        0,
        Math.min(watermarked.width, outWidth),
        Math.min(watermarked.height, outHeight),
        0,
        0,
        Math.min(watermarked.width, outWidth),
        Math.min(watermarked.height, outHeight),
      );

      const frame = new VideoFrame(fit, { timestamp: Math.round((i / fps) * 1_000_000) });
      encoder!.encode(frame, { keyFrame: i % fps === 0 });
      frame.close();

      onProgress?.(i / (totalFrames - 1));
    }

    if (!muxer || !encoder) throw new Error('Encoder was never initialized.');
    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}-${Date.now()}.mp4`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    onProgress?.(1);
  } finally {
    host.remove();
  }
}
