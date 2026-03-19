import { ScaleUpTopologyDiagram } from '@/components/gpu-specs/scale-up-topology-diagram';
import type { GpuSpec } from '@/lib/gpu-specs';

// Three real specs covering all topology types: switched 4-rail, switched NVL72, full mesh
const H100_SXM: GpuSpec = {
  name: 'H100 SXM',
  vendor: 'nvidia',
  memory: '80 GB',
  memoryType: 'HBM3',
  memoryBandwidth: '3.35 TB/s',
  fp4: null,
  fp8: 1979,
  bf16: 989,
  scaleUpTech: 'NVLink 4.0',
  scaleUpBandwidth: '450 GB/s',
  scaleUpWorldSize: 8,
  scaleOutBandwidth: '400 Gbit/s',
  scaleOutTech: 'RoCEv2 Ethernet',
  nic: 'ConnectX-7 2x200GbE',
  scaleOutSwitch: '25.6T Arista Tomahawk4 7060DX5-64S',
  scaleOutTopology: '8-rail optimized',
  scaleUpTopology: 'Switched 4-rail Optimized',
  scaleUpSwitch: '7.2Tbit/s NVSwitch Gen 3.0',
};

const GB200_NVL72: GpuSpec = {
  name: 'GB200 NVL72',
  vendor: 'nvidia',
  memory: '192 GB',
  memoryType: 'HBM3e',
  memoryBandwidth: '8 TB/s',
  fp4: 10000,
  fp8: 5000,
  bf16: 2500,
  scaleUpTech: 'NVLink 5.0',
  scaleUpBandwidth: '900 GB/s',
  scaleUpWorldSize: 72,
  scaleOutBandwidth: null,
  scaleOutTech: null,
  nic: null,
  scaleOutSwitch: null,
  scaleOutTopology: null,
  scaleUpTopology: 'Switched 18-rail Optimized',
  scaleUpSwitch: '28.8Tbit/s NVSwitch Gen 4.0',
};

const MI300X: GpuSpec = {
  name: 'MI300X',
  vendor: 'amd',
  memory: '192 GB',
  memoryType: 'HBM3',
  memoryBandwidth: '5.3 TB/s',
  fp4: null,
  fp8: 2615,
  bf16: 1307,
  scaleUpTech: 'Infinity Fabric',
  scaleUpBandwidth: '448 GB/s',
  scaleUpWorldSize: 8,
  scaleOutBandwidth: '400 Gbit/s',
  scaleOutTech: 'RoCEv2 Ethernet',
  nic: 'Pollara 400GbE',
  scaleOutSwitch: '51.2T Tomahawk5',
  scaleOutTopology: '8-rail optimized',
  scaleUpTopology: 'Full Mesh',
  scaleUpSwitch: null,
};

const ALL_SPECS = [H100_SXM, GB200_NVL72, MI300X];

describe('ScaleUpTopologyDiagram', () => {
  it('renders compact SVG view', () => {
    cy.mount(<ScaleUpTopologyDiagram spec={H100_SXM} allSpecs={ALL_SPECS} />);
    cy.get('svg[role="img"]').should('be.visible');
    cy.contains('H100 SXM').should('be.visible');
  });

  it('click opens dialog with expanded view', () => {
    cy.mount(<ScaleUpTopologyDiagram spec={H100_SXM} allSpecs={ALL_SPECS} />);
    // Click the compact diagram to open the dialog
    cy.get('button[aria-label="Expand H100 SXM scale-up topology diagram"]').click();
    // Dialog should show the spec name in the title
    cy.contains('H100 SXM Scale-Up Topology').should('be.visible');
    // An expanded SVG should exist inside the dialog
    cy.get('[role="dialog"] svg[role="img"]').should('exist');
  });

  it('dialog shows GPU spec name', () => {
    cy.mount(<ScaleUpTopologyDiagram spec={GB200_NVL72} allSpecs={ALL_SPECS} />);
    cy.get('button[aria-label="Expand GB200 NVL72 scale-up topology diagram"]').click();
    cy.contains('GB200 NVL72 Scale-Up Topology').should('be.visible');
  });

  it('Prev/Next navigation works', () => {
    cy.mount(<ScaleUpTopologyDiagram spec={H100_SXM} allSpecs={ALL_SPECS} />);
    cy.get('button[aria-label="Expand H100 SXM scale-up topology diagram"]').click();
    // Should show H100 first with index (1 / 3)
    cy.contains('(1 / 3)').should('be.visible');
    // Click next
    cy.get('[data-testid="scaleup-topology-nav-next"]').click();
    cy.contains('GB200 NVL72 Scale-Up Topology').should('be.visible');
    cy.contains('(2 / 3)').should('be.visible');
    // Click next again
    cy.get('[data-testid="scaleup-topology-nav-next"]').click();
    cy.contains('MI300X Scale-Up Topology').should('be.visible');
    cy.contains('(3 / 3)').should('be.visible');
    // Click prev to go back
    cy.get('[data-testid="scaleup-topology-nav-prev"]').click();
    cy.contains('GB200 NVL72 Scale-Up Topology').should('be.visible');
  });

  it('different topology types render without errors', () => {
    // Switched 4-rail (NVIDIA Hopper)
    cy.mount(<ScaleUpTopologyDiagram spec={H100_SXM} allSpecs={[H100_SXM]} />);
    cy.get('svg[role="img"]').should('exist');

    // Full mesh (AMD)
    cy.mount(<ScaleUpTopologyDiagram spec={MI300X} allSpecs={[MI300X]} />);
    cy.get('svg[role="img"]').should('exist');

    // Switched NVL72 (NVIDIA GB200)
    cy.mount(<ScaleUpTopologyDiagram spec={GB200_NVL72} allSpecs={[GB200_NVL72]} />);
    cy.get('svg[role="img"]').should('exist');
  });
});
