'use client';

import Image from 'next/image';
import Link from 'next/link';

import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { StarButton } from './footer-star-cta';

const STRINGS = {
  en: {
    description:
      'Continuous open-source agentic inference benchmarking. Real-world, reproducible, auditable performance data trusted by trillion dollar AI infrastructure operators like OpenAI, Meta, Oracle, Microsoft, etc.',
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
    agentxHarness: 'AgentX Harness',
    visualization: 'Visualization',
    more: 'More',
    supporters: 'Supporters',
    agentx: 'AgentX',
    telemetry: 'Telemetry',
    articles: 'Articles',
    apiReference: 'API Reference',
    gpuReliability: 'Chip Reliability',
    gpuSpecsDashboard: 'Chip Specs Dashboard',
    perfPerDollar: 'Performance per Dollar',
    modelArchitectures: 'Model Architectures',
    glossary: 'AI Inference Glossary',
    chipSpecs: 'Chip Specs & Pricing',
    rankings: 'GPU Rankings',
    runPages: 'Model on GPU Results',
    cta: 'If this data helps your work, consider starring us on GitHub or sharing with your network.',
    rights: 'All rights reserved.',
  },
  zh: {
    description:
      'InferenceX 持续开展开源的 agentic 推理基准测试，发布来自真实环境、可复现、可审计的性能数据，并获得 OpenAI、Meta、Oracle、Microsoft 等万亿美元级 AI 基础设施运营方的信赖。',
    semianalysis: 'SemiAnalysis',
    mainSite: 'SemiAnalysis 官网',
    newsletter: '订阅通讯',
    about: '关于 SemiAnalysis',
    legal: '法律信息',
    landAcknowledgement: '原住民传统领地声明',
    privacyPolicy: '隐私政策',
    cookiePolicy: 'Cookie 政策',
    contribute: '参与贡献',
    benchmarks: '基准测试仓库',
    agentxHarness: 'AgentX 测试框架',
    visualization: '可视化工具',
    more: '更多',
    supporters: '业界评价',
    agentx: 'AgentX',
    telemetry: '遥测数据',
    articles: '技术文章',
    gpuReliability: '芯片可靠性',
    gpuSpecsDashboard: '芯片规格仪表板',
    apiReference: 'API 文档',
    perfPerDollar: '每美元性能',
    modelArchitectures: '模型架构',
    glossary: 'AI 推理术语表',
    chipSpecs: '芯片规格与价格',
    rankings: 'GPU 排行榜',
    runPages: '模型在 GPU 上的实测结果',
    cta: '如果这些数据对您的工作有帮助，欢迎在 GitHub 上点个 Star，或分享给同事。',
    rights: '版权所有。',
  },
} as const;

export const Footer = ({ starCount }: { starCount?: number | null }) => {
  const locale = useLocale();
  const t = STRINGS[locale];
  // Internal links stay within the current language tree.
  const prefix = locale === 'zh' ? '/zh' : '';
  return (
    <footer
      data-testid="footer"
      className="relative mt-auto w-full overflow-visible pt-16 md:pt-20"
    >
      <div className="container mx-auto border-t border-border/50 px-4 py-10 lg:px-8">
        {/* Main grid */}
        <div className="mb-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-10">
          {/* Left — Brand */}
          <div data-testid="footer-brand" className="flex min-w-0 flex-col items-start gap-3">
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
              className="max-w-prose text-sm leading-relaxed text-muted-foreground lg:max-w-xs"
            >
              {t.description}
            </p>
          </div>

          {/* Center — Links */}
          <div
            data-testid="footer-links"
            className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-6 break-words sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,2fr)]"
          >
            <div data-testid="footer-links-semianalysis" className="flex min-w-0 flex-col gap-1">
              <h2 className="mb-1 text-sm font-semibold text-foreground">{t.semianalysis}</h2>
              <a
                data-testid="footer-link-main-site"
                href="https://semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.mainSite}
              </a>
              <a
                data-testid="footer-link-newsletter"
                href="https://newsletter.semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.newsletter}
              </a>
              <a
                data-testid="footer-link-about"
                href="https://semianalysis.com/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.about}
              </a>
            </div>
            <div data-testid="footer-links-legal" className="flex min-w-0 flex-col gap-1">
              <h2 className="mb-1 text-sm font-semibold text-foreground">{t.legal}</h2>
              <Link
                data-testid="footer-link-land-acknowledgement"
                href={`${prefix}/land-acknowledgement`}
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.landAcknowledgement}
              </Link>
              <a
                data-testid="footer-link-privacy"
                href="https://semianalysis.com/privacy-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.privacyPolicy}
              </a>
              <a
                data-testid="footer-link-cookies"
                href="https://semianalysis.com/cookie-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.cookiePolicy}
              </a>
            </div>
            <div data-testid="footer-links-contribute" className="flex min-w-0 flex-col gap-1">
              <h2 className="mb-1 text-sm font-semibold text-foreground">{t.contribute}</h2>
              <a
                data-testid="footer-link-benchmarks"
                href="https://github.com/SemiAnalysisAI/InferenceX"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.benchmarks}
              </a>
              <a
                data-testid="footer-link-agentx-harness"
                href="https://github.com/SemiAnalysisAI/agentx-harness"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.agentxHarness}
              </a>
              <a
                data-testid="footer-link-visualization"
                href="https://github.com/SemiAnalysisAI/InferenceX-app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
              >
                {t.visualization}
              </a>
            </div>
            {/* "More" holds many links, so it gets a double-width column with
                the links flowing in two sub-columns. This keeps every group on
                one balanced row instead of wrapping below the others. */}
            <div
              data-testid="footer-links-more"
              className="col-span-full xl:col-span-1 flex min-w-0 flex-col gap-1"
            >
              <h2 className="mb-1 text-sm font-semibold text-foreground">{t.more}</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <Link
                  data-testid="footer-link-supporters"
                  href={`${prefix}/quotes`}
                  onClick={() => track('footer_supporters_clicked')}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.supporters}
                </Link>
                <Link
                  data-testid="footer-link-agentx"
                  href={`${prefix}/agentx`}
                  onClick={() => track('footer_agentx_clicked')}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.agentx}
                </Link>
                <Link
                  data-testid="footer-link-telemetry"
                  href={`${prefix}/inference/agentic`}
                  onClick={() => track('footer_telemetry_clicked')}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.telemetry}
                </Link>
                <Link
                  data-testid="footer-link-articles"
                  href={`${prefix}/blog`}
                  onClick={() => track('footer_articles_clicked')}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.articles}
                </Link>
                <Link
                  data-testid="footer-link-api"
                  href={`${prefix}/api`}
                  onClick={() => track('footer_api_clicked')}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.apiReference}
                </Link>
                <Link
                  data-testid="footer-link-reliability"
                  href={`${prefix}/reliability`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.gpuReliability}
                </Link>
                <Link
                  data-testid="footer-link-gpu-specs"
                  href={`${prefix}/gpu-specs`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.gpuSpecsDashboard}
                </Link>
                <Link
                  data-testid="footer-link-compare-per-dollar"
                  href={`${prefix}/compare-per-dollar`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.perfPerDollar}
                </Link>
                <Link
                  data-testid="footer-link-model-architectures"
                  href={`${prefix}/model`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.modelArchitectures}
                </Link>
                <Link
                  data-testid="footer-link-glossary"
                  href={`${prefix}/glossary`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.glossary}
                </Link>
                <Link
                  data-testid="footer-link-chips"
                  href={`${prefix}/chips`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.chipSpecs}
                </Link>
                <Link
                  data-testid="footer-link-rankings"
                  href={`${prefix}/rankings`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.rankings}
                </Link>
                <Link
                  data-testid="footer-link-run"
                  href={`${prefix}/run`}
                  className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none md:min-h-8"
                >
                  {t.runPages}
                </Link>
              </div>
            </div>
          </div>

          {/* Right — CTA + Social */}
          <div
            data-testid="footer-cta"
            className="flex min-w-0 flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between lg:col-span-2"
          >
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
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-right">
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
