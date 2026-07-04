'use client';

import Image from 'next/image';
import Link from 'next/link';

import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { useLocale } from '@/lib/use-locale';

import { StarButton } from './footer-star-cta';

const STRINGS = {
  en: {
    description:
      'Continuous open-source inference benchmarking. Real-world, reproducible, auditable performance data trusted by trillion dollar AI infrastructure operators like OpenAI, Meta, Oracle, Microsoft, etc.',
    semianalysis: 'SemiAnalysis',
    mainSite: 'Main Site',
    newsletter: 'Newsletter',
    about: 'About',
    legal: 'Legal',
    landAcknowledgement: 'Land Acknowledgement',
    privacyPolicy: 'Privacy Policy',
    cookiePolicy: 'Cookie Policy',
    contribute: 'Contribute',
    benchmarks: 'Benchmarks',
    frontend: 'Frontend',
    more: 'More',
    gpuReliability: 'GPU Reliability',
    perfPerDollar: 'Performance per Dollar',
    languageLink: '中文版',
    languageHref: '/zh',
    languageHrefLang: 'zh-CN',
    cta: 'If this data helps your work, consider starring us on GitHub or sharing with your network.',
    rights: 'All rights reserved.',
  },
  zh: {
    description:
      '持续的开源推理基准测试。真实、可复现、可审计的性能数据，获得 OpenAI、Meta、Oracle、Microsoft 等万亿美元级 AI 基础设施运营方的信赖。',
    semianalysis: 'SemiAnalysis',
    mainSite: '官方网站',
    newsletter: '订阅通讯',
    about: '关于我们',
    legal: '法律信息',
    landAcknowledgement: '土地致谢',
    privacyPolicy: '隐私政策',
    cookiePolicy: 'Cookie 政策',
    contribute: '参与贡献',
    benchmarks: '基准测试仓库',
    frontend: '前端仓库',
    more: '更多',
    gpuReliability: 'GPU 可靠性',
    perfPerDollar: '每美元性能',
    languageLink: 'English',
    languageHref: '/',
    languageHrefLang: 'en',
    cta: '如果这些数据对您的工作有帮助，欢迎在 GitHub 上为我们加星或分享给您的同事。',
    rights: '保留所有权利。',
  },
} as const;

export const Footer = ({ starCount }: { starCount?: number | null }) => {
  const locale = useLocale();
  const t = STRINGS[locale];
  // Internal links stay within the current language tree.
  const prefix = locale === 'zh' ? '/zh' : '';
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
              {t.description}
            </p>
          </div>

          {/* Center — Links */}
          <div data-testid="footer-links" className="grid grid-cols-3 gap-x-6 gap-y-8">
            <div data-testid="footer-links-semianalysis" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">{t.semianalysis}</span>
              <a
                data-testid="footer-link-main-site"
                href="https://semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.mainSite}
              </a>
              <a
                data-testid="footer-link-newsletter"
                href="https://newsletter.semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.newsletter}
              </a>
              <a
                data-testid="footer-link-about"
                href="https://semianalysis.com/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.about}
              </a>
            </div>
            <div data-testid="footer-links-legal" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">{t.legal}</span>
              <Link
                data-testid="footer-link-land-acknowledgement"
                href={`${prefix}/land-acknowledgement`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.landAcknowledgement}
              </Link>
              <a
                data-testid="footer-link-privacy"
                href="https://semianalysis.com/privacy-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.privacyPolicy}
              </a>
              <a
                data-testid="footer-link-cookies"
                href="https://semianalysis.com/cookie-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.cookiePolicy}
              </a>
            </div>
            <div data-testid="footer-links-contribute" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">{t.contribute}</span>
              <a
                data-testid="footer-link-benchmarks"
                href="https://github.com/SemiAnalysisAI/InferenceX"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.benchmarks}
              </a>
              <a
                data-testid="footer-link-frontend"
                href="https://github.com/SemiAnalysisAI/InferenceX-app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.frontend}
              </a>
            </div>
            <div data-testid="footer-links-more" className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">{t.more}</span>
              <Link
                data-testid="footer-link-reliability"
                href={`${prefix}/reliability`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.gpuReliability}
              </Link>
              <Link
                data-testid="footer-link-compare-per-dollar"
                href={`${prefix}/compare-per-dollar`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.perfPerDollar}
              </Link>
              <Link
                data-testid="footer-link-zh"
                href={t.languageHref}
                hrefLang={t.languageHrefLang}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.languageLink}
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
              {t.cta}
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          data-testid="footer-bottom-bar"
          className="border-t border-border/40 pt-6 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <p data-testid="footer-copyright" className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} semianalysis.com. {t.rights}
          </p>
        </div>
      </div>
    </footer>
  );
};
