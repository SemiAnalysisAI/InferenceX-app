import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ControlPanel } from '@/components/ui/control-panel';
import { MultiSelect } from '@/components/ui/multi-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Button } from '@/components/ui/button';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CopyableCodeBlock } from '@/components/ui/copyable-code-block';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';

function focusAppearance(element: Element) {
  const style = getComputedStyle(element);
  return {
    shadow: style.boxShadow,
    border: style.borderColor,
    background: style.backgroundColor,
    color: style.color,
    outline: style.outlineStyle,
  };
}

function SegmentedGeometryHarness({ size }: { size: 'sm' | 'default' }) {
  const [value, setValue] = useState('chart');
  return (
    <SegmentedToggle
      size={size}
      value={value}
      onValueChange={setValue}
      ariaLabel={`${size} view`}
      options={[
        { value: 'chart', label: 'Chart' },
        { value: 'table', label: 'Table' },
      ]}
    />
  );
}

function SearchForm({ onSubmit }: { onSubmit: React.FormEventHandler<HTMLFormElement> }) {
  const [value, setValue] = useState('first');
  return (
    <form onSubmit={onSubmit} className="w-72 p-4">
      <SearchableSelect
        size="sm"
        value={value}
        onValueChange={setValue}
        triggerTestId="search-filter"
        groups={[
          {
            label: 'Models',
            options: [
              { value: 'first', label: 'First model' },
              { value: 'second', label: 'Second model' },
            ],
          },
        ]}
      />
      <Button type="button" size="sm" data-testid="compact-action">
        Export
      </Button>
    </form>
  );
}

describe('component CSS harness', () => {
  for (const theme of ['light', 'dark']) {
    it(`keeps focus undecorated without losing selection, validation, or input in ${theme} mode`, () => {
      cy.mount(
        <div className={`${theme} space-y-3 p-4`}>
          <Input aria-label="Editable value" defaultValue="Original" />
          <Input aria-label="Invalid value" aria-invalid="true" defaultValue="Invalid" />
          <Textarea aria-label="Prompt" defaultValue="Full prompt" />
          <Button variant="outline">Action</Button>
          <Switch aria-label="Enabled setting" defaultChecked />
          <a href="#details">Native link</a>
          <InputGroup>
            <InputGroupInput aria-label="Grouped value" defaultValue="Grouped" />
          </InputGroup>
          <Select defaultValue="first">
            <SelectTrigger aria-label="Selected value">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">First option</SelectItem>
              <SelectItem value="second">Second option</SelectItem>
            </SelectContent>
          </Select>
        </div>,
      );
      cy.get('input, textarea, button, a').each(($control) => {
        const before = focusAppearance($control[0]);
        cy.wrap($control)
          .focus()
          .should('be.focused')
          .should(($focused) => {
            expect(focusAppearance($focused[0])).to.deep.equal(before);
            expect(getComputedStyle($focused[0]).outlineStyle).to.equal('none');
          });
      });
      cy.get('[data-slot="input-group"]').then(($group) => {
        cy.get('a').focus();
        cy.then(() => {
          const before = focusAppearance($group[0]);
          cy.get('[aria-label="Grouped value"]').focus();
          cy.wrap($group).should(($focused) => {
            expect(focusAppearance($focused[0])).to.deep.equal(before);
          });
        });
      });
      cy.get('[aria-label="Editable value"]')
        .focus()
        .type(' text')
        .should('have.value', 'Original text');
      cy.get('[aria-label="Invalid value"]')
        .focus()
        .should(($invalid) => {
          const valid = $invalid[0].ownerDocument.querySelector('[aria-label="Editable value"]')!;
          expect(getComputedStyle($invalid[0]).borderColor).not.to.equal(
            getComputedStyle(valid).borderColor,
          );
        });
      cy.get('[role="switch"]')
        .should('have.attr', 'aria-checked', 'true')
        .click()
        .should('have.attr', 'aria-checked', 'false');
      cy.get('[aria-label="Selected value"]').click();
      cy.contains('[role="option"]', 'Second option').focus().type('{enter}');
      cy.get('[aria-label="Selected value"]').should('contain.text', 'Second option');
    });
  }

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark']) {
      it(`aligns form controls and preserves readable labels at ${width}px in ${theme} mode`, () => {
        cy.viewport(width, 720);
        cy.mount(
          <div className={theme}>
            <ControlPanel legend="Configuration" className="m-4">
              <Label htmlFor="control-input">Long benchmark configuration label</Label>
              <Input id="control-input" defaultValue="Full value remains editable" />
              <Select defaultValue="benchmark">
                <SelectTrigger aria-label="Benchmark" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="benchmark">Benchmark</SelectItem>
                </SelectContent>
              </Select>
              <MultiSelect
                value={['benchmark']}
                options={[{ value: 'benchmark', label: 'Benchmark' }]}
                plainSelectedText
                showClearAll={false}
              />
              <SearchableSelect
                value="benchmark"
                groups={[
                  { label: 'Models', options: [{ value: 'benchmark', label: 'Benchmark' }] },
                ]}
                onValueChange={() => {}}
              />
              <Button type="button">Apply</Button>
            </ControlPanel>
          </div>,
        );
        const height = width < 768 ? 44 : 36;
        cy.get('[data-slot="control-panel"]').should(($panel) => {
          const panel = $panel[0];
          expect(panel.tagName).to.eq('FIELDSET');
          const legend = panel.querySelector('legend')!;
          expect(legend.textContent).to.eq('Configuration');
          const label = panel.querySelector('label')!;
          expect(
            label.getBoundingClientRect().top - legend.getBoundingClientRect().bottom,
            'compact space between the legend and the first field label',
          ).to.be.closeTo(4, 1);
          const input = panel.querySelector('input')!;
          const expectedFill = getComputedStyle(input).backgroundColor;
          const bounds = panel.getBoundingClientRect();
          for (const control of panel.querySelectorAll(
            'input, [data-slot="select-trigger"], [data-slot="button"]',
          )) {
            const box = control.getBoundingClientRect();
            expect(box.height, (control as HTMLElement).dataset.slot ?? '').to.eq(height);
            expect(box.left).to.be.at.least(bounds.left);
            expect(box.right).to.be.at.most(bounds.right);
          }
          for (const control of panel.querySelectorAll('[data-slot="select-trigger"]')) {
            expect(getComputedStyle(control).fontSize).to.eq('14px');
            expect(getComputedStyle(control).backgroundColor).to.eq(expectedFill);
          }
          expect(getComputedStyle(input).fontSize).to.eq(width < 768 ? '16px' : '14px');
        });
        cy.contains('label', 'Long benchmark').click();
        cy.focused()
          .should('have.id', 'control-input')
          .and('have.value', 'Full value remains editable');
      });
    }
  }

  it('keeps compact controls touchable and selects a searched option with the keyboard', () => {
    cy.viewport(390, 720);
    cy.mount(
      <SearchForm
        onSubmit={cy
          .stub()
          .callsFake((event) => event.preventDefault())
          .as('filterSubmit')}
      />,
    );
    cy.get('[data-testid="search-filter"], [data-testid="compact-action"]').should(
      'have.css',
      'height',
      '44px',
    );
    cy.get('[data-testid="search-filter"]').click();
    cy.get('input[aria-label="Search options"]').then(($input) => {
      const wrapper = $input[0].parentElement!;
      const before = focusAppearance(wrapper);
      cy.wrap($input).blur().focus().should('be.focused');
      cy.get('input[aria-label="Search options"]')
        .parent()
        .should(($wrapper) => {
          expect(focusAppearance($wrapper[0])).to.deep.equal(before);
          expect(getComputedStyle($wrapper[0]).boxShadow).to.equal('none');
        });
    });
    cy.get('input[aria-label="Search options"]').type('second');
    cy.get('button[aria-label="Clear search"]').should('have.css', 'height', '44px').click();
    cy.focused().should('have.attr', 'aria-label', 'Search options');
    cy.focused().type('second{downarrow}');
    cy.focused().should('have.attr', 'role', 'option').type('{enter}');
    cy.get('[data-testid="search-filter"]')
      .should('contain.text', 'Second model')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('@filterSubmit').should('not.have.been.called');
    cy.viewport(1280, 720);
    cy.get('[data-testid="search-filter"], [data-testid="compact-action"]').should(
      'have.css',
      'height',
      '32px',
    );
  });

  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark', 'minecraft']) {
      it(`keeps selected segments concentric with their outlines at ${width}px in ${theme} mode`, () => {
        cy.viewport(width, 720);
        cy.mount(
          <div className={`${theme} flex flex-col items-start gap-4 p-4`}>
            <SegmentedGeometryHarness size="sm" />
            <SegmentedGeometryHarness size="default" />
          </div>,
        );
        for (const size of ['sm', 'default']) {
          const selector = `[role="tablist"][aria-label="${size} view"]`;
          const assertCorners = (side: 'left' | 'right') => {
            cy.get(selector).should(($group) => {
              const group = $group[0];
              const selected = group.querySelector('[aria-selected="true"]')!;
              const outer = group.getBoundingClientRect();
              const inner = selected.getBoundingClientRect();
              const inset = side === 'left' ? inner.left - outer.left : outer.right - inner.right;
              expect(inner.top - outer.top, 'equal top and side inset').to.be.closeTo(inset, 0.25);
              expect(outer.bottom - inner.bottom, 'equal bottom and side inset').to.be.closeTo(
                inset,
                0.25,
              );
              const outerStyle = getComputedStyle(group);
              const innerStyle = getComputedStyle(selected);
              const corner = side === 'left' ? 'borderTopLeftRadius' : 'borderTopRightRadius';
              expect(parseFloat(innerStyle[corner]), 'concentric selected corner').to.be.closeTo(
                Math.max(0, parseFloat(outerStyle[corner]) - inset),
                0.25,
              );
              expect(inner.height, 'retains usable touch targets').to.be.at.least(
                width < 768 ? 44 : 24,
              );
            });
          };
          assertCorners('left');
          cy.get(selector).contains('[role="tab"]', 'Table').click();
          cy.get(selector)
            .contains('[role="tab"]', 'Table')
            .should('have.attr', 'aria-selected', 'true');
          assertCorners('right');
        }
      });
    }
  }

  it('exposes value filters as pressed buttons and does not submit the surrounding form', () => {
    cy.viewport(390, 720);
    cy.mount(
      <form
        onSubmit={cy
          .stub()
          .callsFake((event) => event.preventDefault())
          .as('metricSubmit')}
      >
        <SegmentedToggle
          role="group"
          size="default"
          value="cost"
          ariaLabel="Metric"
          onValueChange={cy.stub().as('chooseMetric')}
          options={[
            { value: 'cost', label: 'Cost' },
            { value: 'throughput', label: 'Token throughput' },
          ]}
        />
      </form>,
    );
    cy.get('[role="group"]').should('have.attr', 'aria-label', 'Metric');
    cy.get('[role="group"]').should(($group) => {
      const style = getComputedStyle($group[0]);
      expect(style.borderStyle).to.equal('solid');
      expect(style.borderWidth).to.equal('1px');
      expect(style.boxShadow).to.equal('none');
    });
    cy.contains('button', 'Cost').should('have.attr', 'aria-pressed', 'true');
    cy.contains('button', 'Token throughput')
      .should('have.css', 'min-height', '44px')
      .and('have.attr', 'type', 'button')
      .focus()
      .click();
    cy.get('@chooseMetric').should('have.been.calledOnceWith', 'throughput');
    cy.get('@metricSubmit').should('not.have.been.called');
  });

  it('copies the complete code example while keeping a long example in a keyboard-scrollable reader', () => {
    const example = Array.from({ length: 40 }, (_, i) => `field_${i}: "full value"`).join('\n');
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').as('copyCode').resolves();
    });
    cy.mount(
      <CopyableCodeBlock locale="en" label="Response example">
        {example}
      </CopyableCodeBlock>,
    );
    cy.get('pre').should('have.attr', 'tabindex', '0').and('have.text', example);
    cy.get('pre').should(($pre) => {
      expect($pre[0].scrollHeight).to.be.greaterThan($pre[0].clientHeight);
      expect($pre[0].clientHeight).to.be.at.most(384);
    });
    cy.get('button[aria-label="Copy: Response example"]').click();
    cy.get('@copyCode').should('have.been.calledOnceWithExactly', example);
    cy.contains('button', 'Copied').should('be.visible');
  });

  it('keeps code selectable and explains a clipboard failure in Chinese', () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').rejects(new Error('Unavailable'));
    });
    cy.mount(<CopyableCodeBlock locale="zh">curl -sS example.test</CopyableCodeBlock>);
    cy.get('button[aria-label="复制: 代码"]').click();
    cy.get('[role="status"]').should('contain.text', '请选中代码后手动复制');
    cy.get('pre').should('have.text', 'curl -sS example.test');
  });

  it('makes control help keyboard accessible without submitting its form', () => {
    cy.mount(
      <TooltipProvider delayDuration={0}>
        <form onSubmit={cy.stub().as('submit')}>
          <LabelWithTooltip
            htmlFor="help-example"
            label="Benchmark date"
            tooltip="Choose a date with measured results."
          />
          <input id="help-example" />
        </form>
      </TooltipProvider>,
    );
    cy.get('button[aria-label="Help: Benchmark date"]').focus();
    cy.press(Cypress.Keyboard.Keys.SPACE);
    cy.get('[role="dialog"]').should('be.visible').and('contain.text', 'Choose a date');
    cy.get('[role="tooltip"]').should('not.exist');
    cy.get('[role="dialog"]').trigger('keydown', { key: 'Escape', code: 'Escape' });
    cy.get('[role="dialog"]').should('not.exist');
    cy.focused().should('have.attr', 'aria-label', 'Help: Benchmark date');
    cy.contains('label', 'Benchmark date').click();
    cy.focused().should('have.id', 'help-example');
    cy.get('@submit').should('not.have.been.called');
  });

  it('keeps tapped help readable inside a narrow viewport', () => {
    cy.viewport(320, 720);
    cy.mount(
      <TooltipProvider>
        <LabelWithTooltip label="Model" tooltip="All original model details remain available." />
      </TooltipProvider>,
    );
    cy.get('button[aria-label="Help: Model"]').click();
    cy.get('[role="dialog"]').should(($dialog) => {
      const bounds = $dialog[0].getBoundingClientRect();
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(320);
    });
    cy.get('button[aria-label="Help: Model"]').click();
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('wraps a long multi-option metric control inside a narrow panel', () => {
    cy.viewport(320, 720);
    cy.mount(
      <div style={{ width: 280 }}>
        <SegmentedToggle
          value="throughput"
          ariaLabel="Fleet metric"
          onValueChange={cy.stub().as('metricChange')}
          options={[
            { value: 'throughput', label: 'Token throughput' },
            { value: 'revenue', label: 'Revenue per day' },
            { value: 'cost', label: 'Cumulative cost' },
            { value: 'margin', label: 'Operating margin' },
            { value: 'roi', label: 'Return on investment' },
          ]}
        />
      </div>,
    );
    cy.get('[role="tablist"]').should(($control) => {
      const control = $control[0];
      const bounds = control.getBoundingClientRect();
      expect(bounds.width).to.be.at.most(280);
      const tabs = [...control.querySelectorAll('button')];
      expect(new Set(tabs.map((tab) => tab.getBoundingClientRect().top)).size).to.be.greaterThan(1);
      for (const tab of tabs) {
        const box = tab.getBoundingClientRect();
        expect(box.left).to.be.at.least(bounds.left);
        expect(box.right).to.be.at.most(bounds.right);
        expect(tab.scrollWidth, 'full label fits its wrapped button').to.be.at.most(
          tab.clientWidth,
        );
      }
    });
    cy.contains('[role="tab"]', 'Return on investment').click();
    cy.get('@metricChange').should('have.been.calledOnceWith', 'roi');
  });

  it('loads Tailwind visibility and sizing utilities', () => {
    cy.mount(
      <button type="button" data-testid="css-probe" className="hidden size-11">
        probe
      </button>,
    );

    cy.get('[data-testid="css-probe"]').then(($probe) => {
      const style = getComputedStyle($probe[0]);

      expect({ display: style.display, width: style.width, height: style.height }).to.deep.equal({
        display: 'none',
        width: '44px',
        height: '44px',
      });
    });
  });

  for (const width of [375, 1280]) {
    it(`aligns comparison names and vs without splitting hardware names at ${width}px`, () => {
      cy.viewport(width, 720);
      cy.mount(
        <div className="max-w-xl p-4">
          <ComparePairCardLink
            href="/compare/deepseek-r1-b200-vs-b300/8k-1k"
            slug="deepseek-r1-b200-vs-b300"
            label="B200 vs B300"
            archLine="Blackwell · Blackwell"
            scenarioLabel="8K/1K"
            hardwareA={{ label: 'B200', vendor: 'nvidia' }}
            hardwareB={{ label: 'B300', vendor: 'nvidia' }}
          />
          <ComparePairCardLink
            href="/compare/deepseek-v4-gb200-vs-gb300/agentic"
            slug="deepseek-v4-gb200-vs-gb300"
            label="GB200 NVL72 vs GB300 NVL72"
            archLine="Blackwell · Blackwell"
            scenarioLabel="AgentX"
            hardwareA={{ label: 'GB200 NVL72', vendor: 'nvidia' }}
            hardwareB={{ label: 'GB300 NVL72', vendor: 'nvidia' }}
          />
        </div>,
      );
      cy.get('a')
        .first()
        .find('h3 > span')
        .should(($parts) => {
          const bounds = $parts.toArray().map((part) => {
            const range = part.ownerDocument.createRange();
            range.selectNodeContents(part.lastChild!);
            return range.getBoundingClientRect();
          });
          expect(bounds).to.have.length(3);
          for (const rect of bounds.slice(1)) {
            expect(rect.top, 'hardware and vs text share a baseline').to.be.closeTo(
              bounds[0].top,
              1,
            );
            expect(rect.bottom).to.be.closeTo(bounds[0].bottom, 1);
          }
        });
      cy.get('a').each(($card) => {
        const card = $card[0];
        expect(card.scrollWidth).to.be.at.most(card.clientWidth);
        for (const group of card.querySelectorAll('h3 > span:has(img)')) {
          const range = group.ownerDocument.createRange();
          range.selectNodeContents(group.lastChild!);
          expect(range.getClientRects().length, 'each hardware name stays on one line').to.equal(1);
        }
      });
      cy.get('a').first().should('contain.text', '8K/1K').and('not.contain.text', '8K→1K');
    });

    it(`keeps dashboard heading actions clear of long descriptions at ${width}px`, () => {
      cy.viewport(width, 720);
      cy.mount(
        <Card>
          <DashboardSectionHeader
            title="PowerX"
            description="Enter a GitHub Actions run ID to visualize chip metrics over time from gpu_metrics artifacts."
            actions={
              <>
                <Button variant="outline">Re-lock feature gate</Button>
                <Button>Share</Button>
              </>
            }
          />
        </Card>,
      );
      cy.get('[data-slot="card"]').should(($card) => {
        const card = $card[0];
        const bounds = card.getBoundingClientRect();
        const description = card.querySelector('p')!.getBoundingClientRect();
        for (const button of card.querySelectorAll('button')) {
          const action = button.getBoundingClientRect();
          expect(action.right, 'action remains inside the card').to.be.at.most(bounds.right);
          if (width < 640) {
            expect(action.top, 'mobile actions follow the description').to.be.greaterThan(
              description.bottom,
            );
          } else {
            expect(action.left, 'desktop actions do not overlap the description').to.be.greaterThan(
              description.right,
            );
          }
        }
      });
    });

    it(`aligns compound card sections with directly rendered content at ${width}px`, () => {
      cy.viewport(width, 720);
      cy.mount(
        <div style={{ padding: 16 }}>
          <Card>
            <CardHeader>
              <CardTitle>Reproducible analysis</CardTitle>
            </CardHeader>
            <CardContent>Full configuration details</CardContent>
            <CardFooter>Source and date</CardFooter>
            <p data-testid="direct-content">Direct card content</p>
          </Card>
        </div>,
      );
      cy.get('[data-slot="card"]').should(($card) => {
        const card = $card[0];
        const direct = card
          .querySelector('[data-testid="direct-content"]')!
          .getBoundingClientRect();
        const padding = width < 768 ? 16 : 24;
        expect(getComputedStyle(card).paddingLeft).to.equal(`${padding}px`);
        for (const slot of ['card-header', 'card-content', 'card-footer']) {
          const bounds = card.querySelector(`[data-slot="${slot}"]`)!.getBoundingClientRect();
          expect(bounds.left, `${slot} has no second horizontal inset`).to.equal(direct.left);
          expect(bounds.right, `${slot} has no second horizontal inset`).to.equal(direct.right);
        }
      });
    });
  }
});
