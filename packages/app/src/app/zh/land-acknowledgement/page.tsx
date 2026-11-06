import type { Metadata } from 'next';

import { zhAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const REGIONAL_ACKNOWLEDGEMENTS_ZH = [
  {
    region: 'San Jose',
    peoples: 'Muwekma Ohlone Tribe',
    acknowledgement:
      '我们在 San Jose 地区运行的基准测试基础设施，位于旧金山湾区 Muwekma Ohlone Tribe 从未割让的祖居地上。',
  },
  {
    region: 'Los Angeles',
    peoples: 'Tongva、Tataviam、Serrano、Kizh 和 Chumash 原住民族',
    acknowledgement:
      '我们在 Los Angeles 地区运行的基准测试基础设施，位于 Tongva、Tataviam、Serrano、Kizh 和 Chumash 原住民族最早居住、至今仍生活并守护的土地上。',
  },
  {
    region: 'Chicago',
    peoples:
      'Council of the Three Fires、Illinois Confederacy、Miami、Ho-Chunk、Menominee、Fox 和 Sac 原住民族',
    acknowledgement:
      '我们在 Chicago 地区运行的基准测试基础设施，位于 Council of the Three Fires（Ojibwe、Odawa 和 Potawatomi Nations）、Illinois Confederacy，以及 Miami、Ho-Chunk、Menominee、Fox 和 Sac 等众多原住民族世代守护的土地上。',
  },
];

const LAND_ACKNOWLEDGEMENT_DESCRIPTION =
  'InferenceX 在 San Jose、Los Angeles 和 Chicago 设有美国基准测试集群；本声明向这些地区的原住民族及其传统领地致意。';

export const metadata: Metadata = {
  title: '原住民传统领地声明',
  description: LAND_ACKNOWLEDGEMENT_DESCRIPTION,
  alternates: zhAlternates('/land-acknowledgement'),
  ...socialMetadata({
    title: '原住民传统领地声明 | InferenceX',
    description: LAND_ACKNOWLEDGEMENT_DESCRIPTION,
    url: `${SITE_URL}/zh/land-acknowledgement`,
    locale: 'zh',
  }),
};

export default function LandAcknowledgementPageZh() {
  return (
    <main data-testid="land-acknowledgement-page" className="relative">
      <div className="container mx-auto flex flex-col gap-10 px-4 pt-4 lg:px-8 lg:pt-8">
        <header className="max-w-3xl">
          <p className="mb-3 text-xs font-medium text-muted-foreground">原住民传统领地声明</p>
          <h1 className="text-3xl font-semibold text-balance text-foreground md:text-4xl">
            我们承认美国基础设施所在地的原住民传统领地
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
            InferenceX 的基准测试集群为多个地区提供服务。本页聚焦 San Jose、Los Angeles 和 Chicago
            三个美国站点，并向世代守护这些土地、至今依然如此的原住民族致意。
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
              className="rounded-xl border border-border/30 bg-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground">{entry.region}</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{entry.peoples}</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {entry.acknowledgement}
              </p>
            </article>
          ))}
        </section>

        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          传统领地声明只是一个起点。我们发布本声明，以表达对原住民族主权、历史和当代社群的尊重。如有任何措辞需要改进，欢迎指正。
        </p>
      </div>
    </main>
  );
}
