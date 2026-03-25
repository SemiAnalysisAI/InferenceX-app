'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { IntroSection } from '@/components/intro-section';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { track } from '@/lib/analytics';

export function LandingPage() {
  useEffect(() => {
    track('landing_page_viewed');
  }, []);

  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
        <IntroSection />

        {/* CTA */}
        <section className="flex justify-center">
          <Link href="/inference" onClick={() => track('landing_full_dashboard_clicked')}>
            <Button size="lg" className="text-sm sm:text-base px-8 h-12 gap-2">
              Explore Full Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </section>

        {/* Curated Views */}
        <section className="pb-8">
          <h2 className="text-lg font-semibold mb-5 text-center">Popular Comparisons</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FAVORITE_PRESETS.map((preset) => (
              <CuratedViewCard key={preset.id} preset={preset} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
