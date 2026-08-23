import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const REGIONAL_ACKNOWLEDGEMENTS_ZH = [
  {
    region: 'San Jose',
    peoples: 'Muwekma Ohlone Tribe',
    acknowledgement:
      '我们位于 San Jose 地区的基准测试基础设施，建在旧金山湾区 Muwekma Ohlone Tribe 尚未割让的祖居地上。',
  },
  {
    region: 'Los Angeles',
    peoples: 'Tongva、Tataviam、Serrano、Kizh 和 Chumash 原住民族',
    acknowledgement:
      '我们位于 Los Angeles 地区的基准测试基础设施，建在 Tongva、Tataviam、Serrano、Kizh 和 Chumash 原住民族最早居住、至今仍在生活并守护的土地上。',
  },
  {
    region: 'Chicago',
    peoples:
      'Council of the Three Fires、Illinois Confederacy、Miami、Ho-Chunk、Menominee、Fox 和 Sac 原住民族',
    acknowledgement:
      '我们位于 Chicago 地区的基准测试基础设施，建在 Council of the Three Fires（Ojibwe、Odawa 和 Potawatomi Nations）、Illinois Confederacy 以及 Miami、Ho-Chunk、Menominee、Fox 和 Sac 等其他原住民族世代守护的土地上。',
  },
];

const LAND_ACKNOWLEDGEMENT_DESCRIPTION =
  'InferenceX 就 San Jose、Los Angeles 和 Chicago 美国基准测试集群所在的原住民族与传统领地所作的声明。';

export const metadata: Metadata = {
  title: '原住民传统领地声明',
  description: LAND_ACKNOWLEDGEMENT_DESCRIPTION,
  alternates: zhAlternates('/land-acknowledgement'),
  openGraph: {
    title: '原住民传统领地声明 | InferenceX',
    description: LAND_ACKNOWLEDGEMENT_DESCRIPTION,
    url: `${SITE_URL}/zh/land-acknowledgement`,
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    title: '原住民传统领地声明 | InferenceX',
    description: LAND_ACKNOWLEDGEMENT_DESCRIPTION,
  },
};

export default function LandAcknowledgementPageZh() {
  return (
    <main data-testid="land-acknowledgement-page" className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              原住民传统领地声明
            </p>
            <h1 className="text-4xl font-semibold tracking-heading text-foreground md:text-5xl">
              我们承认并尊重美国基础设施所在地的原住民传统领地。
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX 基准测试集群服务多个地区。本页聚焦 San Jose、Los Angeles 和 Chicago
              三个美国站点，向世代守护这些土地并延续至今的原住民族致意。
            </p>
          </header>

          <section
            data-testid="land-acknowledgement-regions"
            className="grid gap-4 lg:grid-cols-3"
            aria-label="各地区原住民传统领地声明"
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
                <h2 className="mt-3 text-xl font-semibold tracking-heading text-foreground">
                  {entry.peoples}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {entry.acknowledgement}
                </p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            承认这些传统领地只是起点。我们怀着对原住民族主权、历史及延续至今的社群的尊重作出本声明；如有措辞需要改进，欢迎指正。
          </p>
        </Card>
      </div>
    </main>
  );
}
