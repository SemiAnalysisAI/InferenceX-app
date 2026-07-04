import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const REGIONAL_ACKNOWLEDGEMENTS_ZH = [
  {
    region: 'San Jose',
    peoples: 'Muwekma Ohlone 部落',
    acknowledgement:
      '我们位于 San Jose 地区的基准测试基础设施运行在旧金山湾区 Muwekma Ohlone 部落未被让渡的祖传家园之上。',
  },
  {
    region: 'Los Angeles',
    peoples: 'Tongva、Tataviam、Serrano、Kizh 和 Chumash 族群',
    acknowledgement:
      '我们位于 Los Angeles 地区的基准测试基础设施运行在 Tongva、Tataviam、Serrano、Kizh 和 Chumash 族群最初居住并至今仍在守护的土地之上。',
  },
  {
    region: 'Chicago',
    peoples: '三火议会、Illinois 联盟、Miami、Ho-Chunk、Menominee、Fox 和 Sac 族群',
    acknowledgement:
      '我们位于 Chicago 地区的基准测试基础设施运行在由三火议会（Ojibwe、Odawa 和 Potawatomi 部落）、Illinois 联盟以及包括 Miami、Ho-Chunk、Menominee、Fox 和 Sac 在内的众多原住民族群守护的土地之上。',
  },
];

export const metadata: Metadata = {
  title: '土地致谢',
  description:
    '对与 InferenceX 美国基准测试集群（San Jose、Los Angeles 和 Chicago）所在土地相关的原住民族群和家园的致谢。',
  alternates: zhAlternates('/land-acknowledgement'),
  openGraph: {
    title: '土地致谢 | InferenceX',
    description:
      '对与 InferenceX 美国基准测试集群（San Jose、Los Angeles 和 Chicago）所在土地相关的原住民族群和家园的致谢。',
    url: `${SITE_URL}/zh/land-acknowledgement`,
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    title: '土地致谢 | InferenceX',
    description:
      '对与 InferenceX 美国基准测试集群（San Jose、Los Angeles 和 Chicago）所在土地相关的原住民族群和家园的致谢。',
  },
};

export default function LandAcknowledgementPageZh() {
  return (
    <main data-testid="land-acknowledgement-page" className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              土地致谢
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              我们致敬与我们美国基础设施所在土地相关的原住民家园。
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX 基准测试集群为多个地区提供服务。本页聚焦于我们在美国的 San Jose、Los
              Angeles 和 Chicago
              站点，并向世代守护这些土地、至今仍在延续这一使命的原住民族群致以敬意。
            </p>
          </header>

          <section
            data-testid="land-acknowledgement-regions"
            className="grid gap-4 lg:grid-cols-3"
            aria-label="各地区土地致谢"
          >
            {REGIONAL_ACKNOWLEDGEMENTS_ZH.map((entry) => (
              <article
                key={entry.region}
                data-testid={`land-acknowledgement-${entry.region
                  .toLowerCase()
                  .replaceAll(' ', '-')}`}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  {entry.region}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {entry.peoples}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {entry.acknowledgement}
                </p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            致谢只是一个起点。我们怀着对原住民主权、历史和持续存在的社区的尊重分享这份声明，如果措辞需要改进，欢迎指正。
          </p>
        </Card>
      </div>
    </main>
  );
}
