'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Megaphone, X } from 'lucide-react';

import { track } from '@/lib/analytics';
import { fetchAvailability, fetchWorkflowInfo } from '@/lib/api';
import {
  type BannerInfo,
  buildBannerFromWorkflowInfo,
  dismiss,
  getHardcodedBanner,
  isDismissed,
} from '@/lib/banner-data';

export function AnnouncementBanner() {
  const [banner, setBanner] = useState<BannerInfo | null>(null);

  useEffect(() => {
    // Check hardcoded announcements first (sync, no fetch)
    const hardcoded = getHardcodedBanner();
    if (hardcoded) {
      setBanner(hardcoded);
      track('banner_viewed', { banner_id: hardcoded.id });
      return;
    }

    // Fall back to automated changelog banner
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAvailability();
        if (cancelled || rows.length === 0) return;

        const latestDate = rows
          .reduce((max, r) => (r.date > max ? r.date : max), rows[0].date)
          .slice(0, 10);

        const data = await fetchWorkflowInfo(latestDate);
        if (cancelled) return;

        const info = buildBannerFromWorkflowInfo(latestDate, data);
        if (!info || isDismissed(info.id)) return;

        setBanner(info);
        track('banner_viewed', { banner_id: info.id });
      } catch {
        // Silently fail — banner is non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismiss(banner.id);
    track('banner_dismissed', { banner_id: banner.id });
    setBanner(null);
  };

  const className =
    'animate-in fade-in slide-in-from-top-2 duration-300 bg-brand/15 border border-brand/30 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-brand/25';

  const content = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <Megaphone className="h-4 w-4 text-brand shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{banner.message}</span>
        {banner.date && (
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
            {banner.date}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {banner.linkHref && (
          <>
            <span className="text-xs text-brand font-medium hidden sm:inline">View</span>
            <ChevronRight className="h-3.5 w-3.5 text-brand shrink-0" />
          </>
        )}
        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-brand/20 rounded transition-colors ml-1"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </>
  );

  if (banner.linkHref) {
    return (
      <Link
        href={banner.linkHref}
        onClick={() => {
          dismiss(banner.id);
          track('banner_clicked', { banner_id: banner.id, link_href: banner.linkHref });
          setBanner(null);
        }}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
