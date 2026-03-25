'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';

import { ModeToggle } from '@/components/ui/mode-toggle';
import { cn } from '@/lib/utils';

import { GitHubStars } from './GithubStars';

const NAV_LINKS = [
  {
    href: '/inference',
    label: 'Dashboard',
    testId: 'nav-link-dashboard',
    event: 'header_dashboard_clicked',
  },
  { href: '/media', label: 'Media', testId: 'nav-link-media', event: 'header_media_clicked' },
  {
    href: '/quotes',
    label: 'Supporters',
    testId: 'nav-link-supporters',
    event: 'header_supporters_clicked',
  },
  { href: '/blog', label: 'Articles', testId: 'nav-link-blog', event: 'header_blog_clicked' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/inference')
    return (
      pathname !== '/' &&
      !pathname.startsWith('/media') &&
      !pathname.startsWith('/quotes') &&
      !pathname.startsWith('/blog')
    );
  return pathname.startsWith(href);
}

export const Header = () => {
  const pathname = usePathname() ?? '/';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close menu on click outside
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileMenuOpen]);

  const toggleMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
    track('header_mobile_menu_toggled');
  }, []);

  return (
    <header data-testid="header" className="border-b border-border/40">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex h-14 items-center gap-6">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg font-bold tracking-tight">InferenceX</span>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              by
              <Image
                src="/brand/logo-color.webp"
                alt="SemiAnalysis logo"
                width={64}
                height={27}
                className="inline w-[48px]"
                priority
              />
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, testId, event }) => (
              <Link
                key={href}
                data-testid={testId}
                href={href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  isActive(pathname, href)
                    ? 'text-brand bg-brand/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
                onClick={() => track(event)}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            <GitHubStars owner="SemiAnalysisAI" repo="InferenceX" />
            <ModeToggle />

            {/* Mobile hamburger */}
            <div ref={menuRef} className="relative md:hidden">
              <button
                type="button"
                data-testid="mobile-menu-toggle"
                onClick={toggleMenu}
                className="flex items-center justify-center w-9 h-9 rounded-md transition-colors hover:bg-muted cursor-pointer"
                aria-expanded={mobileMenuOpen}
                aria-label="Navigation menu"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {mobileMenuOpen ? (
                    <>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </>
                  ) : (
                    <>
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                    </>
                  )}
                </svg>
              </button>
              {mobileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 flex flex-col rounded-lg border border-border bg-background p-1.5 shadow-lg min-w-[160px]">
                  {NAV_LINKS.map(({ href, label, event }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        isActive(pathname, href)
                          ? 'text-brand bg-brand/10'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                      onClick={() => track(event)}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
