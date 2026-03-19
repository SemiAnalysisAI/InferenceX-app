import FavoritePresetsDropdown from '@/components/favorites/FavoritePresetsDropdown';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { mountWithProviders } from '../support/test-utils';

describe('FavoritePresetsDropdown', () => {
  beforeEach(() => {
    mountWithProviders(<FavoritePresetsDropdown />, { inference: {} });
  });

  it('renders the toggle button', () => {
    cy.get('[data-testid="favorites-toggle"]').should('be.visible');
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Favorites');
  });

  it('panel is hidden by default', () => {
    cy.get('[data-testid="favorites-panel"]').should('not.exist');
  });

  it('clicking toggle opens the panel', () => {
    cy.get('[data-testid="favorites-toggle"]').click();
    cy.get('[data-testid="favorites-panel"]').should('be.visible');
  });

  it('clicking toggle again closes the panel', () => {
    cy.get('[data-testid="favorites-toggle"]').click();
    cy.get('[data-testid="favorites-panel"]').should('be.visible');
    cy.get('[data-testid="favorites-toggle"]').click();
    cy.get('[data-testid="favorites-panel"]').should('not.exist');
  });

  it('renders all preset cards with their titles', () => {
    cy.get('[data-testid="favorites-toggle"]').click();

    for (const preset of FAVORITE_PRESETS) {
      cy.get(`[data-testid="favorite-preset-${preset.id}"]`)
        .should('be.visible')
        .and('contain.text', preset.title);
    }
  });

  it('preset cards show descriptions and tags', () => {
    cy.get('[data-testid="favorites-toggle"]').click();

    const first = FAVORITE_PRESETS[0];
    cy.get(`[data-testid="favorite-preset-${first.id}"]`).should(
      'contain.text',
      first.description.slice(0, 30),
    );

    for (const tag of first.tags) {
      cy.get(`[data-testid="favorite-preset-${first.id}"]`).should('contain.text', tag);
    }
  });

  it('clicking a preset calls context setters to apply it', () => {
    cy.get('[data-testid="favorites-toggle"]').click();

    const preset = FAVORITE_PRESETS[0]; // gb200-vs-b200
    cy.get(`[data-testid="favorite-preset-${preset.id}"]`).click();

    cy.get('@setSelectedModel').should('have.been.calledWith', preset.config.model);
    cy.get('@setSelectedSequence').should('have.been.calledWith', preset.config.sequence);
    cy.get('@setSelectedPrecisions').should('have.been.calledWith', preset.config.precisions);
    cy.get('@setSelectedYAxisMetric').should('have.been.calledWith', preset.config.yAxisMetric);
    cy.get('@setActivePresetId').should('have.been.calledWith', preset.id);
  });

  it('clicking an active preset clears it', () => {
    // Mount with the first preset already active
    mountWithProviders(<FavoritePresetsDropdown />, {
      inference: { activePresetId: FAVORITE_PRESETS[0].id },
    });

    cy.get('[data-testid="favorites-toggle"]').click();
    cy.get(`[data-testid="favorite-preset-${FAVORITE_PRESETS[0].id}"]`).click();

    // Clearing sets activePresetId to null
    cy.get('@setActivePresetId').should('have.been.calledWith', null);
    cy.get('@selectAllHwTypes').should('have.been.called');
  });

  it('shows "Active" badge when a preset is active', () => {
    mountWithProviders(<FavoritePresetsDropdown />, {
      inference: { activePresetId: FAVORITE_PRESETS[0].id },
    });

    cy.get('[data-testid="favorites-toggle"]').should('contain.text', FAVORITE_PRESETS[0].title);
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Active');
  });
});
