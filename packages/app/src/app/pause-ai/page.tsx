import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const CORE_MESSAGES = [
  {
    title: 'Capability is compounding',
    body: 'We benchmark frontier inference every single day, and the trend line only points one way: tokens get faster, cheaper, and more capable with every software release and every hardware generation. The systems we measure today would have been unthinkable two years ago. Nobody — including the labs shipping them — can say where that curve flattens.',
  },
  {
    title: 'Speed without steering is risk',
    body: 'Leading AI researchers, including Turing Award winners, have warned that sufficiently capable systems could erode the institutions we depend on, concentrate power, and ultimately escape meaningful human control. When the people building the technology say it might be dangerous, the burden of proof should sit with deployment, not with caution.',
  },
  {
    title: 'Coordination beats unilateralism',
    body: 'No single lab can pause alone without ceding ground to competitors — that is precisely why the Pause AI movement calls for an international, verifiable agreement to halt training of the most powerful general systems until there is scientific consensus they can be built safely. Racing dynamics are a policy problem, and policy problems have policy solutions.',
  },
];

const QUOTES = [
  {
    quote:
      'Mitigating the risk of extinction from AI should be a global priority alongside other societal-scale risks such as pandemics and nuclear war.',
    attribution: 'Statement on AI Risk',
    detail: 'Signed by leaders of OpenAI, Anthropic, Google DeepMind, and hundreds of researchers',
    href: 'https://www.safe.ai/work/statement-on-ai-risk',
  },
  {
    quote:
      'It is hard to see how you can prevent the bad actors from using it for bad things… I console myself with the normal excuse: if I hadn’t done it, somebody else would have.',
    attribution: 'Geoffrey Hinton',
    detail: 'Turing Award winner, Nobel laureate in Physics',
    href: 'https://www.nytimes.com/2023/05/01/technology/ai-google-chatbot-engineer-quits-hinton.html',
  },
  {
    quote:
      'Rogue AI may be dangerous for the whole of humanity. Banning powerful AI systems (say beyond the abilities of GPT-4) that are given autonomy and agency would be a good start.',
    attribution: 'Yoshua Bengio',
    detail: 'Turing Award winner, most-cited AI researcher',
    href: 'https://yoshuabengio.org/2023/05/22/how-rogue-ais-may-arise/',
  },
];

const ACTIONS = [
  {
    title: 'Learn about the movement',
    body: 'PauseAI is a global, volunteer-led movement campaigning for an international treaty to pause frontier AI training until it can be done safely.',
    linkText: 'Visit pauseai.info',
    href: 'https://pauseai.info/',
  },
  {
    title: 'Understand the risks',
    body: 'Read the case in full — from near-term harms like cyberweapons and destabilized institutions to loss-of-control scenarios — written for newcomers and skeptics alike.',
    linkText: 'Read the risk overview',
    href: 'https://pauseai.info/risks',
  },
  {
    title: 'Take action',
    body: 'Write to your representatives, join a local chapter, or simply talk about it. Movements are built from ordinary people deciding the trajectory of AI is everyone’s business.',
    linkText: 'Get involved',
    href: 'https://pauseai.info/action',
  },
];

const DESCRIPTION =
  'InferenceX measures how fast AI is accelerating, every single day. Here is why we believe calls for a coordinated pause on frontier AI development deserve to be taken seriously.';

export const metadata: Metadata = {
  title: 'Pause AI',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pause-ai` },
  openGraph: {
    title: 'Pause AI | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/pause-ai`,
  },
  twitter: {
    title: 'Pause AI | InferenceX',
    description: DESCRIPTION,
  },
};

export default function PauseAiPage() {
  return (
    <main data-testid="pause-ai-page" className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4 pb-8">
        <section>
          <Card className="gap-10">
            <header className="max-w-3xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                Pause AI
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
                We measure the acceleration. That is exactly why we take the case for a pause
                seriously.
              </h1>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                InferenceX exists to measure frontier AI inference — continuously, reproducibly, in
                the open. That vantage point gives us an unusually direct view of how quickly
                capability per dollar is compounding. The Pause AI movement argues that humanity
                should not build smarter-than-human systems until we know how to do so safely, and
                that this requires international coordination. We think that argument deserves an
                honest hearing, especially from people who watch the curve bend every day.
              </p>
            </header>

            <section
              data-testid="pause-ai-core-messages"
              className="grid gap-4 lg:grid-cols-3"
              aria-label="Why a pause"
            >
              {CORE_MESSAGES.map((entry, i) => (
                <article
                  key={entry.title}
                  className="rounded-2xl border border-border/40 bg-background/20 p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                    {entry.title}
                  </h2>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{entry.body}</p>
                </article>
              ))}
            </section>
          </Card>
        </section>

        <section>
          <Card>
            <h2 className="text-lg font-semibold mb-2">What the field is saying</h2>
            <p className="text-muted-foreground mb-4 text-sm">
              These are not fringe voices. The warnings below come from the researchers who built
              modern AI and the labs racing to extend it.
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              {QUOTES.map((entry) => (
                <figure
                  key={entry.attribution}
                  className="flex flex-col rounded-2xl border border-border/40 bg-background/20 p-5"
                >
                  <blockquote className="flex-1 text-sm leading-6 text-foreground">
                    &ldquo;{entry.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-4">
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {entry.attribution}
                    </a>
                    <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <Card>
            <h2 className="text-lg font-semibold mb-2">Measurement is not endorsement</h2>
            <p className="text-muted-foreground mb-2">
              Some readers will find it odd that an inference benchmark — a project whose entire
              purpose is making AI deployment faster and cheaper — would platform a movement asking
              the industry to slow down. We see no contradiction. Transparent, independent
              measurement is a public good in every scenario: if development continues at full
              speed, the world deserves an honest account of what these systems cost and what they
              can do; if the world chooses to pause, verification and monitoring will depend on
              exactly the kind of open, reproducible measurement infrastructure we build.
            </p>
            <p className="text-muted-foreground">
              You do not have to agree with every claim the movement makes to agree with its core
              premise: decisions this consequential should not be made by a handful of competing
              labs on racing incentives. They belong to everyone.
            </p>
          </Card>
        </section>

        <section>
          <Card>
            <h2 className="text-lg font-semibold mb-4">What you can do</h2>
            <div className="grid gap-4 lg:grid-cols-3 mb-2">
              {ACTIONS.map((entry) => (
                <article
                  key={entry.title}
                  className="flex flex-col rounded-2xl border border-border/40 bg-background/20 p-5"
                >
                  <h3 className="text-base font-semibold text-foreground">{entry.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                    {entry.body}
                  </p>
                  <Link
                    href={entry.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                  >
                    {entry.linkText}
                  </Link>
                </article>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              This page reflects the views of the InferenceX team at SemiAnalysis. InferenceX is not
              affiliated with Stichting PauseAI; we link to their materials because we think the
              questions they raise deserve a wider audience.
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}
