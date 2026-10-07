// Hosted previews cannot capture the cursor. The standalone build uses the native adapter.
export function acquireMouse(_canvas, fallback) {
  fallback();
}
export function releaseMouse() {}
export function isMouseCaptured() {
  return false;
}
