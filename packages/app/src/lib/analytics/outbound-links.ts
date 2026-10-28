import { track } from './analytics';

export interface OutboundLink {
  host: string;
  path: string;
  is_newsletter: boolean;
  is_semianalysis: boolean;
}

/** Classifies an anchor href. Returns null for same-host, relative, and non-http(s) links. */
export function classifyOutboundLink(href: string, currentHost: string): OutboundLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === currentHost.toLowerCase()) return null;
  const isSemianalysis = host === 'semianalysis.com' || host.endsWith('.semianalysis.com');
  return {
    host,
    path: url.pathname,
    is_newsletter:
      host === 'newsletter.semianalysis.com' ||
      host.endsWith('.substack.com') ||
      (isSemianalysis && /^\/(?:subscribe|newsletter)(?:\/|$)/.test(url.pathname)),
    is_semianalysis: isSemianalysis,
  };
}

function handleClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const link = classifyOutboundLink(anchor.href, window.location.hostname);
  if (link) track('outbound_link_clicked', { ...link }, { transport: 'sendBeacon' });
}

/** Installs one delegated listener for every outbound anchor click. Returns the uninstaller. */
export function installOutboundLinkTracking(): () => void {
  // Capture phase so links that stop propagation or unmount on click are still counted.
  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}
