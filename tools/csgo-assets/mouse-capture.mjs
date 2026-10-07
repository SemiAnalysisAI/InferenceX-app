let desiredCanvas = null;
let request = 0;
export function acquireMouse(canvas, fallback) {
  desiredCanvas = canvas;
  const current = ++request;
  const failed = () => {
    if (current === request && desiredCanvas === canvas) fallback();
  };
  try {
    if (!canvas.requestPointerLock) return failed();
    const pending = canvas.requestPointerLock();
    pending?.then(() => {
      // Opening a menu can cancel capture before the browser grants the request.
      if (desiredCanvas !== canvas && document.pointerLockElement === canvas)
        document.exitPointerLock?.();
    }, failed);
  } catch {
    failed();
  }
}
export function releaseMouse() {
  desiredCanvas = null;
  request++;
  document.exitPointerLock?.();
}
export function isMouseCaptured(canvas) {
  return document.pointerLockElement === canvas;
}
