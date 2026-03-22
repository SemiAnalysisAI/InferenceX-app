'use client';

import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';

interface SocialShareButtonsProps {
  className?: string;
  compact?: boolean;
}

/**
 * @deprecated Use ShareTwitterButton and ShareLinkedInButton directly instead.
 */
export function SocialShareButtons({ className = '' }: SocialShareButtonsProps) {
  return (
    <div data-testid="social-share-buttons" className={`flex items-center gap-1.5 ${className}`}>
      <ShareTwitterButton />
      <ShareLinkedInButton />
    </div>
  );
}
