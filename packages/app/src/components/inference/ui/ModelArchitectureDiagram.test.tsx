// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Model } from '@/lib/data-mappings';
import { getModelArchitecture } from '@/lib/model-architectures';

const mocks = vi.hoisted(() => ({
  renderDiagram: vi.fn(),
  theme: { resolved: 'light' },
  pathname: { value: '/inference' },
}));

vi.mock('./model-architecture-diagram-renderer', () => ({
  renderDiagram: mocks.renderDiagram,
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mocks.theme.resolved }),
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname.value }));

import ModelArchitectureDiagram from './ModelArchitectureDiagram';

interface ArchitectureRendererModule {
  renderDiagram: (...args: unknown[]) => void;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];

  target: Element | null = null;

  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  disconnect() {}

  trigger() {
    if (!this.target) throw new Error('ResizeObserver has no observed target');
    this.callback(
      [
        {
          target: this.target,
          contentRect: { width: observedWidth } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
}

let container: HTMLDivElement;
let root: Root;
let observedWidth: number;
let clientWidthSpy: { mockRestore: () => void };

function render(model: Model = Model.DeepSeek_R1) {
  act(() => root.render(<ModelArchitectureDiagram model={model} />));
}

function expand() {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-testid="model-architecture-toggle"]',
  );
  if (!toggle) throw new Error('Architecture toggle did not render');
  act(() => toggle.click());
}

beforeEach(() => {
  observedWidth = 500;
  mocks.theme.resolved = 'light';
  mocks.renderDiagram.mockReset();
  mocks.pathname.value = '/inference';
  ResizeObserverStub.instances = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  clientWidthSpy = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(() => observedWidth);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clientWidthSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe('ModelArchitectureDiagram rendering', () => {
  it('preserves the exact English release sentence spacing', () => {
    render();
    expand();

    expect(container.textContent).toContain('Released by DeepSeek on');
    expect(container.textContent).not.toContain('DeepSeekon');
  });

  it('localizes the complete architecture chrome and keeps technical feature data intact', () => {
    mocks.pathname.value = '/zh/inference';
    render();

    const toggle = container.querySelector('[data-testid="model-architecture-toggle"]');
    expect(toggle?.textContent).toContain('模型架构');
    expect(toggle?.textContent).toContain('MoE');

    expand();
    expect(container.textContent).toContain('特性：');
    expect(container.textContent).toContain('发布方 DeepSeek，发布于');
    expect(container.textContent).not.toContain('DeepSeek ，');
    expect(container.textContent).not.toContain('Features:');
    expect(container.textContent).not.toContain('Released by');
  });

  it('renders once on initial expansion and ignores the observer callback for the same width', () => {
    render();
    expand();

    expect(mocks.renderDiagram).toHaveBeenCalledTimes(1);
    expect(ResizeObserverStub.instances).toHaveLength(1);

    act(() => ResizeObserverStub.instances[0].trigger());
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(1);

    observedWidth = 460;
    act(() => ResizeObserverStub.instances[0].trigger());
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(2);

    act(() => ResizeObserverStub.instances[0].trigger());
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(2);
  });

  it('rerenders when theme, expanded blocks, or model changes', () => {
    render();
    expand();
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(1);

    mocks.theme.resolved = 'dark';
    render();
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(2);

    const toggleBlock = mocks.renderDiagram.mock.calls.at(-1)?.[4] as
      | ((blockId: string) => void)
      | undefined;
    expect(toggleBlock).toBeTypeOf('function');
    act(() => toggleBlock?.('experts'));
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(3);
    expect(mocks.renderDiagram.mock.calls.at(-1)?.[3]).toEqual(new Set(['experts']));

    render(Model.GptOss);
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(4);
  });

  it('passes locale to the renderer and includes it in the render cache key', () => {
    render();
    expand();
    expect(mocks.renderDiagram.mock.calls.at(-1)?.[5]).toBe('en');

    mocks.pathname.value = '/zh/inference';
    render();
    expect(mocks.renderDiagram).toHaveBeenCalledTimes(2);
    expect(mocks.renderDiagram.mock.calls.at(-1)?.[5]).toBe('zh');
  });

  it('renders objective English and Chinese SVG labels', async () => {
    const renderer = await vi.importActual<ArchitectureRendererModule>(
      './model-architecture-diagram-renderer',
    );
    const renderActual = renderer.renderDiagram;
    const arch = getModelArchitecture(Model.DeepSeek_R1);
    expect(arch).toBeDefined();

    const wrapper = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrapper.append(svg);
    document.body.append(wrapper);

    renderActual(svg, arch!, false, new Set(), vi.fn(), 'en');
    expect(svg.textContent).toContain('Token Embedding');
    expect(svg.textContent).toContain('Dense Transformer Block');
    expect(svg.textContent).toContain('Output Head (LM Head)');
    expect(svg.textContent).toContain('Type');
    expect(svg.textContent).toContain('Layers');
    expect(svg.textContent).toContain('Context');

    renderActual(svg, arch!, false, new Set(), vi.fn(), 'zh');
    expect(svg.textContent).toContain('Token 嵌入');
    expect(svg.textContent).toContain('稠密 Transformer 块');
    expect(svg.textContent).toContain('输出头（LM Head）');
    expect(svg.textContent).toContain('类型');
    expect(svg.textContent).toContain('层数');
    expect(svg.textContent).toContain('上下文');
    expect(svg.textContent).not.toContain('Token Embedding');

    wrapper.remove();
  });
});
