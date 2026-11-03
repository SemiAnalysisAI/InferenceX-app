'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/ui/share-buttons';
import { track } from '@/lib/analytics/analytics';
import { analyticsPlacement } from '@/lib/analytics/placement';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';

import { StarButton } from './footer-star-cta';

const STRINGS = {
  en: {
    description:
      'Continuous open-source AI accelerator system benchmarking. Real-world, reproducible, auditable performance data trusted by trillion dollar AI infrastructure operators like OpenAI, Meta, Oracle, Microsoft, etc.',
    semianalysis: 'SemiAnalysis',
    mainSite: 'Main site',
    newsletter: 'Newsletter',
    about: 'About',
    legal: 'Legal',
    landAcknowledgement: 'Land acknowledgement',
    privacyPolicy: 'Privacy policy',
    cookiePolicy: 'Cookie policy',
    contribute: 'Contribute',
    benchmarks: 'Benchmarks',
    agentxHarness: 'AgentX harness',
    visualization: 'Visualization',
    more: 'More',
    supporters: 'Supporters',
    agentx: 'AgentX',
    telemetry: 'Telemetry',
    comparisons: 'Comparisons',
    articles: 'Articles',
    hardwareResults: 'Hardware results',
    whitepapers: 'Whitepapers',
    apiReference: 'API reference',
    historicalTrends: 'Historical trends',
    tcoCalculator: 'TCO calculator',
    fleetLifecycle: 'Fleet lifecycle',
    firstTokenLimits: 'First-token limits',
    cacheReuse: 'Prefix cache reuse',
    gpuReliability: 'Chip reliability',
    gpuSpecsDashboard: 'Chip specs dashboard',
    perfPerDollar: 'Performance per dollar',
    modelArchitectures: 'Model architectures',
    glossary: 'AI inference glossary',
    chipSpecs: 'Chip specs & pricing',
    rankings: 'GPU rankings',
    runPages: 'Model on GPU results',
    cta: 'If this data helps your work, consider starring us on GitHub or sharing with your network.',
    rights: 'All rights reserved.',
    logoAlt: 'SemiAnalysis logo',
  },
  zh: {
    description:
      'InferenceX 持续开展开源的 AI 加速器系统基准测试，发布来自真实环境、可复现、可审计的性能数据，并获得 OpenAI、Meta、Oracle、Microsoft 等万亿美元级 AI 基础设施运营方的信赖。',
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
    comparisons: '性能对比',
    articles: '技术文章',
    hardwareResults: '硬件结果',
    whitepapers: '白皮书',
    historicalTrends: '历史趋势',
    tcoCalculator: 'TCO 计算器',
    fleetLifecycle: '集群生命周期',
    firstTokenLimits: '首 token 延迟约束',
    cacheReuse: '前缀缓存复用',
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
    logoAlt: 'SemiAnalysis 标志',
  },
} as const;

const FOOTER_EVENT_PROPERTIES = { placement: 'footer' } as const;

const FOOTER_LINK =
  'inline-flex min-h-11 items-center rounded-md py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8';

export const Footer = () => {
  const locale = useLocale();
  const pathname = usePathname();
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';
  if (isEmbedPathname(pathname)) return null;
  return (
    <footer
      data-testid="footer"
      {...analyticsPlacement('footer')}
      className="relative mt-auto w-full overflow-visible pt-12 md:pt-16"
    >
      <div className="container mx-auto border-t border-border/30 px-4 py-10 lg:px-8">
        <div className="mb-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-10">
          <div data-testid="footer-brand" className="flex min-w-0 flex-col items-start gap-3">
            <IntentPrefetchLink
              data-testid="footer-brand-link"
              target="_blank"
              href="https://semianalysis.com/"
              className="inline-block w-35 h-14.5"
            >
              <Image
                width={140}
                height={58}
                src="/brand/logo-color.webp"
                alt={t.logoAlt}
                className="h-auto"
              />
            </IntentPrefetchLink>
            <p
              data-testid="footer-brand-description"
              className="max-w-prose text-sm leading-relaxed text-muted-foreground lg:max-w-xs"
            >
              {t.description}
            </p>
          </div>

          <div
            data-testid="footer-links"
            className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-6 break-words sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,2fr)]"
          >
            <div data-testid="footer-links-semianalysis" className="flex min-w-0 flex-col gap-1">
              <h2 className="mb-1 text-sm font-medium text-foreground">{t.semianalysis}</h2>
              <a
                data-testid="footer-link-main-site"
                href="https://semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.mainSite}
              </a>
              <a
                data-testid="footer-link-newsletter"
                href="https://newsletter.semianalysis.com"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.newsletter}
              </a>
              <a
                data-testid="footer-link-about"
                href="https://semianalysis.com/about/"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.about}
              </a>
            </div>
            <div data-testid="footer-links-legal" className="flex min-w-0 flex-col gap-1">
              <h2 className="mb-1 text-sm font-medium text-foreground">{t.legal}</h2>
              <IntentPrefetchLink
                data-testid="footer-link-land-acknowledgement"
                href={`${prefix}/land-acknowledgement`}
                className={FOOTER_LINK}
              >
                {t.landAcknowledgement}
              </IntentPrefetchLink>
              <a
                data-testid="footer-link-privacy"
                href="https://semianalysis.com/privacy-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.privacyPolicy}
              </a>
              <a
                data-testid="footer-link-cookies"
                href="https://semianalysis.com/cookie-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.cookiePolicy}
              </a>
            </div>
            <div data-testid="footer-links-contribute" className="flex min-w-0 flex-col gap-1">
              <h2 className="mb-1 text-sm font-medium text-foreground">{t.contribute}</h2>
              <a
                data-testid="footer-link-benchmarks"
                href="https://github.com/SemiAnalysisAI/InferenceX"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.benchmarks}
              </a>
              <a
                data-testid="footer-link-agentx-harness"
                href="https://github.com/SemiAnalysisAI/agentx-harness"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.agentxHarness}
              </a>
              <a
                data-testid="footer-link-visualization"
                href="https://github.com/SemiAnalysisAI/InferenceX-app"
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK}
              >
                {t.visualization}
              </a>
            </div>
            <div
              data-testid="footer-links-more"
              className="col-span-full xl:col-span-1 flex min-w-0 flex-col gap-1"
            >
              <h2 className="mb-1 text-sm font-medium text-foreground">{t.more}</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <IntentPrefetchLink
                  data-testid="footer-link-supporters"
                  href={`${prefix}/quotes`}
                  onClick={() => track('footer_supporters_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.supporters}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-agentx"
                  href={`${prefix}/agentx`}
                  onClick={() => track('footer_agentx_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.agentx}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-telemetry"
                  href={`${prefix}/inference/agentic`}
                  onClick={() => track('footer_telemetry_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.telemetry}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-compare"
                  href={`${prefix}/compare`}
                  onClick={() => track('footer_compare_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.comparisons}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-articles"
                  href={`${prefix}/blog`}
                  onClick={() => track('footer_articles_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.articles}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-hardware"
                  href={`${prefix}/hardware`}
                  onClick={() => track('footer_hardware_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.hardwareResults}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-whitepapers"
                  href={`${prefix}/whitepaper`}
                  onClick={() => track('footer_whitepapers_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.whitepapers}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-api"
                  href={`${prefix}/api`}
                  onClick={() => track('footer_api_clicked', FOOTER_EVENT_PROPERTIES)}
                  className={FOOTER_LINK}
                >
                  {t.apiReference}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-historical"
                  href={`${prefix}/historical`}
                  className={FOOTER_LINK}
                  onClick={() => track('footer_historical_clicked', FOOTER_EVENT_PROPERTIES)}
                >
                  {t.historicalTrends}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-calculator"
                  href={`${prefix}/calculator`}
                  className={FOOTER_LINK}
                  onClick={() => track('footer_calculator_clicked', FOOTER_EVENT_PROPERTIES)}
                >
                  {t.tcoCalculator}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-fleet"
                  href={`${prefix}/fleet`}
                  className={FOOTER_LINK}
                  onClick={() => track('footer_fleet_clicked', FOOTER_EVENT_PROPERTIES)}
                >
                  {t.fleetLifecycle}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-first-token"
                  href={`${prefix}/first-token`}
                  className={FOOTER_LINK}
                  onClick={() => track('footer_first_token_clicked', FOOTER_EVENT_PROPERTIES)}
                >
                  {t.firstTokenLimits}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-cache-reuse"
                  href={`${prefix}/cache-reuse`}
                  className={FOOTER_LINK}
                  onClick={() => track('footer_cache_reuse_clicked', FOOTER_EVENT_PROPERTIES)}
                >
                  {t.cacheReuse}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-reliability"
                  href={`${prefix}/reliability`}
                  className={FOOTER_LINK}
                >
                  {t.gpuReliability}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-gpu-specs"
                  href={`${prefix}/gpu-specs`}
                  className={FOOTER_LINK}
                >
                  {t.gpuSpecsDashboard}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-compare-per-dollar"
                  href={`${prefix}/compare-per-dollar`}
                  className={FOOTER_LINK}
                >
                  {t.perfPerDollar}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-model-architectures"
                  href={`${prefix}/model`}
                  className={FOOTER_LINK}
                >
                  {t.modelArchitectures}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-glossary"
                  href={`${prefix}/glossary`}
                  className={FOOTER_LINK}
                >
                  {t.glossary}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-chips"
                  href={`${prefix}/chips`}
                  className={FOOTER_LINK}
                >
                  {t.chipSpecs}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-rankings"
                  href={`${prefix}/rankings`}
                  className={FOOTER_LINK}
                >
                  {t.rankings}
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  data-testid="footer-link-run"
                  href={`${prefix}/run`}
                  className={FOOTER_LINK}
                >
                  {t.runPages}
                </IntentPrefetchLink>
              </div>
            </div>
          </div>

          <div
            data-testid="footer-cta"
            className="flex min-w-0 flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between lg:col-span-2"
          >
            <div data-testid="footer-social-buttons" className="flex items-center gap-2">
              <StarButton />
              <ShareTwitterButton />
              <ShareLinkedInButton />
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-right">
              {t.cta}
            </p>
          </div>
        </div>

        <div
          data-testid="footer-bottom-bar"
          className="flex flex-col items-center justify-between gap-4 border-t border-border/30 pt-6 md:flex-row"
        >
          <p data-testid="footer-copyright" className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} semianalysis.com. {t.rights}
          </p>
        </div>
      </div>
    </footer>
  );
};
