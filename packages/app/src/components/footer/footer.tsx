import Image from 'next/image';
import Link from 'next/link';

import { SocialShareButtons } from '@/components/social-share-buttons';
import { cn } from '@/lib/utils';

import { FooterStarCta } from './footer-star-cta';

export const Footer = () => {
  return (
    <footer
      data-testid="footer"
      className={cn(
        'w-full',
        'before:absolute',
        'before:bg-muted/50',
        'dark:before:bg-muted',
        'before:bottom-0',
        'before:content-[""]',
        'before:hidden lg:before:block',
        'before:w-1/2',
        'before:h-full',
        'before:right-0',
        "before:mask-[url('/left-pattern-full.svg')]",
        'before:mask-no-repeat',
        'before:mask-position-[top_right]',
        'before:mask-size-[100%]',
        'before:rotate-180',
        'before:-z-10',
      )}
    >
      <div className="container mx-auto py-8 px-4 flex flex-col items-center justify-center">
        {/* GitHub Star CTA */}
        <FooterStarCta />

        {/* Social Share */}
        <div className="flex flex-col items-center gap-2 mb-6 pb-6 border-b border-border/40">
          <p className="text-xs text-muted-foreground">Share InferenceX with your network</p>
          <SocialShareButtons compact />
        </div>

        {/* Policy Links */}
        <nav className="mb-4">
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <li>
              <a
                href="https://semianalysis.com/privacy-policy/"
                className="underline hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
            </li>
            <li>
              <a
                href="https://semianalysis.com/cookie-policy/"
                className="underline hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cookie Policy
              </a>
            </li>
            <li>
              <a
                href="https://github.com/SemiAnalysisAI/InferenceX"
                className="underline hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contribute
              </a>
            </li>
          </ul>
        </nav>

        {/* Copyright Notice */}
        <p data-testid="footer-copyright" className="text-sm text-muted-foreground text-center">
          &copy; {new Date().getFullYear()} semianalysis.com All rights reserved.
        </p>

        {/* Logo Section */}
        <div className="mt-4 flex items-center justify-center">
          <Link target="_blank" className="hidden dark:block" href="https://semianalysis.com/">
            <Image width={184} height={76} src="/logo.png" alt="SemiAnalysis logo" />
          </Link>
          <Link target="_blank" className="dark:hidden" href="https://semianalysis.com/">
            <Image width={184} height={76} src="/logo-black.png" alt="SemiAnalysis logo" />
          </Link>
        </div>
      </div>
    </footer>
  );
};
