import { Card } from '@/components/ui/card';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES } from '@/components/quotes/quotes-data';

export function IntroSection() {
  return (
    <section>
      <Card data-testid="intro-section">
        <h2 data-testid="intro-heading" className="text-lg font-semibold mb-2">
          Open Source Continuous Inference Benchmark trusted by Operators of Trillion Dollar
          GigaWatt Scale Token Factories
        </h2>
        <p className="text-muted-foreground mb-2">
          As the world progresses exponentially towards AGI, software development and model releases
          move at the speed of light. Existing benchmarks rapidly become obsolete due to their
          static nature, and participants often submit software images purpose-built for the
          benchmark itself which do not reflect real world performance.
        </p>
        <p className="text-muted-foreground mb-2">
          <strong>InferenceX&trade;</strong> (formerly InferenceMAX) is our independent, vendor
          neutral, reproducible benchmark which addresses these issues by continuously benchmarking
          inference software across a wide range of AI accelerators that are actually available to
          the ML community.
        </p>
        <p className="text-muted-foreground">
          Our open data & insights are widely adopted by the ML community, capacity planning
          strategy teams at trillion dollar token factories & AI Labs & at multiple billion dollar
          NeoClouds. Learn more in our articles:{' '}
          <a
            data-testid="intro-link-v1"
            href="https://newsletter.semianalysis.com/p/inferencemax-open-source-inference"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline font-medium"
          >
            v1
          </a>
          ,{' '}
          <a
            data-testid="intro-link-v2"
            href="https://newsletter.semianalysis.com/p/inferencex-v2-nvidia-blackwell-vs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline font-medium"
          >
            v2
          </a>
          .
        </p>
        <div className="mt-4 pt-4 border-t border-foreground">
          <QuoteCarousel
            quotes={QUOTES.filter((q) =>
              [
                'OpenAI',
                'Microsoft',
                'Together AI',
                'vLLM',
                'GPU Mode',
                'PyTorch Foundation',
                'Oracle',
                'CoreWeave',
                'Nebius',
                'Crusoe',
                'TensorWave',
                'SGLang',
                'WEKA',
              ].includes(q.org),
            )}
            overrides={{
              order: ['OpenAI'],
              labels: {
                'Together AI': 'Tri Dao',
                'PyTorch Foundation': 'PyTorch',
              },
            }}
            moreHref="/quotes"
          />
        </div>
      </Card>
    </section>
  );
}
