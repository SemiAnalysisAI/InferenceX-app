import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils';

import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';

import { StarButton } from './footer-star-cta';

export const Footer = () => {
  return (
    <footer
      data-testid="footer"
      className={cn(
        'relative w-full overflow-visible mt-auto',
        'before:absolute',
        'before:bg-muted/50',
        'dark:before:bg-muted',
        'before:bottom-0',
        'before:content-[""]',
        'before:hidden lg:before:block',
        'before:w-1/2',
        'before:h-[200%]',
        'before:right-0',
        "before:mask-[url('/left-pattern-full.svg')]",
        'before:mask-no-repeat',
        'before:mask-position-[top_right]',
        'before:mask-size-[100%]',
        'before:rotate-180',
        'before:-z-10',
      )}
    >
      <div className="container mx-auto px-4 lg:px-8 py-12">
        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 mb-10">
          {/* Left — Brand */}
          <div className="flex flex-col gap-4 items-center md:items-start">
            <Link
              target="_blank"
              href="https://semianalysis.com/"
              className="inline-block w-35 h-14.5"
            >
              <Image
                width={140}
                height={58}
                src="/logo.png"
                alt="SemiAnalysis logo"
                className="hidden dark:block"
              />
              <Image
                width={140}
                height={58}
                src="/logo-black.png"
                alt="SemiAnalysis logo"
                className="dark:hidden"
              />
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Continuous open-source inference benchmarks. Transparent, real-world GPU performance
              data for the ML community.
            </p>
          </div>

          {/* Center — Links */}
          <div className="grid grid-cols-3 gap-6">
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">SemiAnalysis</span>
              <a
                href="https://semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Main Site
              </a>
              <a
                href="https://newsletter.semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Newsletter
              </a>
              <a
                href="https://semianalysis.com/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">Legal</span>
              <a
                href="https://semianalysis.com/privacy-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="https://semianalysis.com/cookie-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cookie Policy
              </a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">Contribute</span>
              <a
                href="https://github.com/SemiAnalysisAI/InferenceX"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Benchmarks
              </a>
              <a
                href="https://github.com/SemiAnalysisAI/InferenceX-app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Frontend
              </a>
            </div>
          </div>

          {/* Right — CTA + Social */}
          <div className="flex flex-col gap-4 md:items-end">
            <div className="flex items-center gap-1.5">
              <div className="rounded-md bg-background/80 w-fit">
                <StarButton />
              </div>
              <div className="rounded-md bg-background/80 w-fit">
                <ShareTwitterButton />
              </div>
              <div className="rounded-md bg-background/80 w-fit">
                <ShareLinkedInButton />
              </div>
            </div>
            <p className="text-sm text-muted-foreground md:text-right max-w-xs">
              If this data helps your work, star us or share with your network.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/40 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p data-testid="footer-copyright" className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} semianalysis.com. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
