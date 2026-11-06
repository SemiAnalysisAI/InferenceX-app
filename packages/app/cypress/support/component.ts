import { mount } from 'cypress/react';

import '@/app/globals.css';

import { registerScatterPointsQuery } from './scatter-points';

declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}

Cypress.Commands.add('mount', mount);
registerScatterPointsQuery();
