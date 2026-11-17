import { EASE, MOTION, cssEase, reducedMotion } from './motion';

/** Draws a picture into `box`, scaled to fit inside it and centred, as `object-fit: contain` does. */
function contain(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  box: { x: number; y: number; width: number; height: number },
) {
  if (width === 0 || height === 0) return;
  const scale = Math.min(box.width / width, box.height / height);
  context.drawImage(
    source,
    box.x + (box.width - width * scale) / 2,
    box.y + (box.height - height * scale) / 2,
    width * scale,
    height * scale,
  );
}

/**
 * Paints what the clip stage shows now onto `canvas`, its child, and fades that picture out. It is
 * called just before the stage changes to another pair, prompt or view, so the new picture comes
 * up under the old one instead of replacing it in one frame. Each side is drawn where it sits,
 * from its first frame while that still covers the clip and from the clip's own frame after;
 * a side marked `data-shown="from,to"` shows only that share of its width, as Wipe clips it.
 * Nothing is painted under reduced motion, or while the stage is zoomed.
 */
export function ghostStage(canvas: HTMLCanvasElement | null): void {
  const stage = canvas?.parentElement;
  if (!canvas || !stage || reducedMotion() || typeof canvas.animate !== 'function') return;
  const box = stage.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  if (stage.querySelector('video[style*="scale"]')) return;
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.width * density);
  canvas.height = Math.round(box.height * density);
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(density, 0, 0, density, 0, 0);
  let painted = false;
  try {
    for (const side of stage.querySelectorAll<HTMLElement>('[data-side]')) {
      const picture = side.firstElementChild;
      if (!(picture instanceof HTMLElement) || picture.classList.contains('invisible')) continue;
      const at = side.getBoundingClientRect();
      const area = {
        x: at.left - box.left,
        y: at.top - box.top,
        width: at.width,
        height: at.height,
      };
      const [from, to] = (picture.dataset.shown ?? '0,100').split(',').map(Number);
      context.save();
      context.beginPath();
      context.rect(
        area.x + (area.width * from) / 100,
        area.y,
        (area.width * (to - from)) / 100,
        area.height,
      );
      context.clip();
      context.fillStyle = '#000';
      context.fillRect(area.x, area.y, area.width, area.height);
      const image = picture.querySelector('img');
      const video = picture.querySelector('video');
      if (image?.complete && image.naturalWidth > 0)
        contain(context, image, image.naturalWidth, image.naturalHeight, area);
      else if (video && video.readyState >= 2 && !video.classList.contains('invisible'))
        contain(context, video, video.videoWidth, video.videoHeight, area);
      context.restore();
      painted = true;
    }
    const difference = stage.querySelector<HTMLCanvasElement>(
      'canvas[data-testid="video-results-difference"]',
    );
    if (difference && difference.width > 0) {
      const area = { x: 0, y: 0, width: box.width, height: box.height };
      context.fillStyle = '#000';
      context.fillRect(0, 0, box.width, box.height);
      contain(context, difference, difference.width, difference.height, area);
      painted = true;
    }
  } catch {
    // A picture the browser will not draw leaves the stage to change at once, as before.
    return;
  }
  if (!painted) return;
  for (const running of canvas.getAnimations()) running.cancel();
  canvas.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: MOTION.base,
    easing: cssEase(EASE.standard),
  });
}
