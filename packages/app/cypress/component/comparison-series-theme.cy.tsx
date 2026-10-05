import { useTheme } from 'next-themes';

import { useComparisonSeries } from '@/components/inference/hooks/useComparisonSeries';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { APP_THEMES } from '@/lib/themes';

import { mountWithProviders } from '../support/test-utils';

function ComparisonColor() {
  const { setTheme } = useTheme();
  const { allGraphs } = useComparisonSeries();

  return (
    <>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('csgo')}>csgo</button>
      <button onClick={() => setTheme('gta')}>gta</button>
      <output data-testid="comparison-color">{allGraphs[0]?.color}</output>
    </>
  );
}

describe('comparison chart themes', () => {
  for (const highContrast of [false, true]) {
    it(`keeps decorative themes on the dark comparison palette (${highContrast ? 'high contrast' : 'standard'})`, () => {
      mountWithProviders(
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          themes={APP_THEMES}
          storageKey={`comparison-series-${highContrast}`}
        >
          <ComparisonColor />
        </ThemeProvider>,
        { inference: { selectedGPUs: ['h100'], highContrast } },
      );

      cy.contains('button', 'dark').click();
      cy.get('[data-testid="comparison-color"]')
        .invoke('text')
        .then((darkColor) => {
          expect(darkColor.length).to.be.greaterThan(0);
          for (const theme of ['csgo', 'gta']) {
            cy.contains('button', theme).click();
            cy.get('[data-testid="comparison-color"]').should('have.text', darkColor);
          }
        });
    });
  }
});
