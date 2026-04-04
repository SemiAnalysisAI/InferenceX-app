import Image from 'next/image';
import Link from 'next/link';

import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';

import { StarButton } from './footer-star-cta';

export const Footer = ({ starCount }: { starCount?: number | null }) => {
  return (
    <footer data-testid="footer" className="relative w-full overflow-visible mt-auto pt-32">
      <div className="container mx-auto px-4 lg:px-8 py-12">
        {/* Main grid */}
        <div className="flex flex-col md:flex-row md:justify-between gap-10 md:gap-8 mb-10">
          {/* Left — Brand */}
          <div
            data-testid="footer-brand"
            className="flex flex-col gap-4 items-center md:items-start"
          >
            <Link
              data-testid="footer-brand-link"
              target="_blank"
              href="https://semianalysis.com/"
              className="inline-block w-35 h-14.5"
            >
              <Image
                width={140}
                height={58}
                src="/brand/logo-color.webp"
                alt="SemiAnalysis logo"
                className="h-auto"
              />
            </Link>
            <p
              data-testid="footer-brand-description"
              className="text-sm text-muted-foreground max-w-xs text-center md:text-left"
            >
              Continuous open-source inference benchmarking. Real-world, reproducible, auditable
              performance data trusted by trillion dollar AI infrastructure operators like OpenAI,
              Oracle, Microsoft, etc.
            </p>
          </div>

          {/* Center — Links */}
          <div data-testid="footer-links" className="grid grid-cols-3 gap-x-6 gap-y-8">
            <div data-testid="footer-links-semianalysis" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">SemiAnalysis</span>
              <a
                data-testid="footer-link-main-site"
                href="https://semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Main Site
              </a>
              <a
                data-testid="footer-link-newsletter"
                href="https://newsletter.semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Newsletter
              </a>
              <a
                data-testid="footer-link-about"
                href="https://semianalysis.com/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </a>
            </div>
            <div data-testid="footer-links-legal" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">Legal</span>
              <a
                data-testid="footer-link-privacy"
                href="https://semianalysis.com/privacy-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </a>
              <a
                data-testid="footer-link-cookies"
                href="https://semianalysis.com/cookie-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cookie Policy
              </a>
            </div>
            <div data-testid="footer-links-contribute" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">Contribute</span>
              <a
                data-testid="footer-link-benchmarks"
                href="https://github.com/SemiAnalysisAI/InferenceX"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Benchmarks
              </a>
              <a
                data-testid="footer-link-frontend"
                href="https://github.com/SemiAnalysisAI/InferenceX-app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Frontend
              </a>
            </div>
            <div data-testid="footer-links-more" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">More</span>
              <Link
                data-testid="footer-link-reliability"
                href="/reliability"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                GPU Reliability
              </Link>
            </div>
          </div>

          {/* Right — CTA + Social */}
          <div data-testid="footer-cta" className="flex flex-col gap-4 items-center md:items-end">
            <div data-testid="footer-social-buttons" className="flex items-center gap-1.5">
              <div className="rounded-md bg-background/80 w-fit">
                <StarButton starCount={starCount} />
              </div>
              <div className="rounded-md bg-background/80 w-fit">
                <ShareTwitterButton />
              </div>
              <div className="rounded-md bg-background/80 w-fit">
                <ShareLinkedInButton />
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center md:text-right max-w-xs">
              If this data helps your work, consider starring us on GitHub or sharing with your
              network.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          data-testid="footer-bottom-bar"
          className="border-t border-border/40 pt-6 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <p data-testid="footer-copyright" className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} semianalysis.com. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
