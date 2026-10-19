/** Presentation policy only: retain run URLs as provenance and overlay identities. */
export function showRunLink(url: string | null | undefined, hardware?: string): url is string {
  if (!url || hardware?.toLowerCase().startsWith('tpu')) return false;
  try {
    const parsed = new URL(url);
    return !(
      parsed.hostname.toLowerCase() === 'github.com' &&
      /(?:^|[-_])tpu(?:[-_]|$)/i.test(parsed.pathname.split('/')[2] ?? '')
    );
  } catch {
    return true;
  }
}
