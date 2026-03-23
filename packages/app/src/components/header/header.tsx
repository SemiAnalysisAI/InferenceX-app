'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics';

import { ModeToggle } from '@/components/ui/mode-toggle';
import { cn } from '@/lib/utils';

import { GitHubStars } from './GithubStars';

const NAV_LINKS = [
  {
    href: '/',
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
  if (href === '/')
    return (
      pathname === '/' ||
      (!pathname.startsWith('/media') &&
        !pathname.startsWith('/quotes') &&
        !pathname.startsWith('/blog'))
    );
  return pathname.startsWith(href);
}

const baseClasses =
  'items-center px-3 py-1.5 rounded-md border transition-colors text-sm font-medium';
const inactiveClasses =
  'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800';
const activeClasses = 'bg-primary/10 border-primary/50 text-primary';

export const Header = () => {
  const pathname = usePathname();

  return (
    <header
      data-testid="header"
      className={cn(
        'before:absolute',
        'before:bg-muted/50',
        'dark:before:bg-muted',
        'before:bottom-0',
        'before:content-[""]',
        'before:hidden lg:before:block',
        'before:top-0',
        'before:w-1/2',
        'before:h-full',
        'before:left-0',
        "before:mask-[url('/brand/left-pattern-full.svg')]",
        'before:mask-no-repeat',
        'before:mask-position-[top_right]',
        'before:mask-size-[100%]',
        'before:-z-10',
      )}
    >
      <div className="container mx-auto py-4 lg:p-8">
        <div className="flex flex-col gap-2 p-4 lg:p-8">
          <div className="flex flex-row gap-4 lg:gap-8">
            <div className="flex flex-col justify-center">
              <h1 className="scroll-m-20 text-2xl md:text-3xl lg:text-5xl font-bold tracking-tight text-balance">
                InferenceX
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground italic pl-2">
                (formerly InferenceMAX)
              </p>
              <div className="flex flex-row gap-2 text-sm lg:text-base items-center pl-25 md:pl-28 lg:pl-45 -mt-1 md:-mt-2 lg:-mt-9">
                By
                <Link className="hover:underline" target="_blank" href="https://semianalysis.com/">
                  <Image
                    src="/brand/logo-color.webp"
                    alt="SemiAnalysis logo"
                    width={128}
                    height={53}
                    className="inline w-[64px] md:w-[96px] lg:w-[128px]"
                    priority
                  />
                </Link>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {NAV_LINKS.map(({ href, label, testId, event }) => (
                <Link
                  key={href}
                  data-testid={testId}
                  href={href}
                  className={cn(
                    'hidden md:flex',
                    baseClasses,
                    isActive(pathname, href) ? activeClasses : inactiveClasses,
                  )}
                  onClick={() => track(event)}
                >
                  {label}
                </Link>
              ))}
              <GitHubStars owner="SemiAnalysisAI" repo="InferenceX" />
              <ModeToggle />
            </div>
          </div>
          <div data-testid="mobile-nav" className="flex md:hidden items-center gap-2 mt-8">
            {NAV_LINKS.map(({ href, label, event }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex',
                  baseClasses,
                  isActive(pathname, href) ? activeClasses : inactiveClasses,
                )}
                onClick={() => track(event)}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
