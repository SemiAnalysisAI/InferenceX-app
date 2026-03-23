const SAMPLES = [
  {
    label: 'Short title + Short subtitle',
    title: 'GPU Price Wars',
    subtitle: 'Cloud costs are dropping fast.',
  },
  {
    label: 'Short title + Long subtitle',
    title: 'DeepSeek V3',
    subtitle:
      'A deep dive into the architecture, training methodology, and inference performance of the latest open-weight model challenging frontier labs.',
  },
  {
    label: 'Long title + Short subtitle',
    title: "Why NVIDIA's Blackwell Architecture Changes Everything About Datacenter Economics",
    subtitle: 'The numbers tell the story.',
  },
  {
    label: 'Long title + Long subtitle',
    title: 'The Complete Guide to Mixture-of-Experts Inference Optimization on Modern Hardware',
    subtitle:
      'From roofline analysis to kernel fusion, we benchmark every major MoE serving framework across H100, MI300X, and Gaudi 3 accelerators.',
  },
  {
    label: 'Very long title + Very long subtitle',
    title:
      'How Google, Microsoft, and Amazon Are Rethinking Their Custom Silicon Strategy After the Latest Round of Benchmark Results Showed Surprising Gaps',
    subtitle:
      'We spoke with engineers at all three hyperscalers and analyzed over 200 internal benchmark configurations to understand why off-the-shelf GPUs are still winning in latency-sensitive workloads despite massive investments in custom ASICs.',
  },
  {
    label: 'Real post (hello-world slug)',
    slug: 'hello-world',
  },
];

function buildSrc(sample: (typeof SAMPLES)[number]) {
  if (sample.slug) {
    return `/api/og-preview?slug=${sample.slug}`;
  }
  const params = new URLSearchParams({ slug: 'hello-world' });
  if (sample.title) params.set('title', sample.title);
  if (sample.subtitle) params.set('subtitle', sample.subtitle);
  return `/api/og-preview?${params.toString()}`;
}

export default function OgPreviewPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">OG Image — Text Samples</h1>
      <p className="text-muted-foreground mb-10">
        Testing V13 with different title/subtitle length combinations.
      </p>
      <div className="flex flex-col gap-12">
        {SAMPLES.map((sample) => (
          <div key={sample.label} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{sample.label}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildSrc(sample)}
              alt={sample.label}
              width={1200}
              height={630}
              loading="lazy"
              className="w-full h-auto rounded border border-border"
            />
          </div>
        ))}
      </div>
    </main>
  );
}
