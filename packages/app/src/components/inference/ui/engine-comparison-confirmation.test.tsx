// @test-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'bun:test';

import { $, click, contains, eventually, get, press, render } from '@/test/dom';

import { EngineComparisonConfirmation } from './engine-comparison-confirmation';

function Harness({ confirm, cancel }: { confirm: () => void; cancel: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <EngineComparisonConfirmation
      open={open}
      onConfirm={() => {
        confirm();
        setOpen(false);
      }}
      onCancel={() => {
        cancel();
        setOpen(false);
      }}
    />
  );
}

describe('Engine comparison confirmation', () => {
  it('requires an affirmative agreement and focuses Cancel first', async () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(<Harness confirm={confirm} cancel={cancel} />);
    await eventually(() => expect(document.activeElement?.textContent).toBe('Cancel'));
    expect(confirm).not.toHaveBeenCalled();
    click(contains('button', 'I agree, show both'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    await eventually(() => expect($('[role="dialog"]')).toBeNull());
  });

  it('treats Escape as cancellation, not acceptance', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(<Harness confirm={confirm} cancel={cancel} />);
    press('Escape', get('[role="dialog"]'));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});
