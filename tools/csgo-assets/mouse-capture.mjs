export function acquireMouse(canvas, fallback) {
  try {
    if (!canvas.requestPointerLock) return fallback();
    const pending = canvas.requestPointerLock();
    pending?.catch(fallback);
  } catch {
    fallback();
  }
}
export function releaseMouse() {
  document.exitPointerLock?.();
}
export function isMouseCaptured(canvas) {
  return document.pointerLockElement === canvas;
}
