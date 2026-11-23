// @test-environment jsdom
import { act, useState } from 'react';
import { describe, expect, it, mock } from 'bun:test';

import { blur, dispatch, focus, get, render, type } from '@/test/dom';

import { type DraftNumberCommit, useDraftNumberInput } from './useDraftNumberInput';

// Spinner clicks, and Cypress typing, fire input events without an inputType.
function inputWithoutType(field: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  });
  dispatch(field, new Event('input', { bubbles: true }));
}

const parsePositive = (raw: string) => {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function Field({ onCommit }: { onCommit: (next: number, source: DraftNumberCommit) => void }) {
  const [value, setValue] = useState(60);
  const input = useDraftNumberInput(value, parsePositive, (next, source) => {
    setValue(next);
    onCommit(next, source);
  });
  return (
    <>
      <input type="number" data-testid="field" {...input} />
      <output data-testid="committed">{value}</output>
    </>
  );
}

function setup() {
  const onCommit = mock<(next: number, source: DraftNumberCommit) => void>();
  render(<Field onCommit={onCommit} />);
  return {
    onCommit,
    field: get<HTMLInputElement>('[data-testid="field"]'),
    committed: () => get('[data-testid="committed"]').textContent,
  };
}

describe('useDraftNumberInput', () => {
  it('keeps typed text as a draft and commits it on blur', () => {
    const { onCommit, field, committed } = setup();
    type(field, '{selectall}105');
    expect(field.value).toBe('105');
    expect(committed()).toBe('60');
    expect(onCommit).not.toHaveBeenCalled();

    blur(field);
    expect(onCommit).toHaveBeenLastCalledWith(105, 'blur');
    expect(committed()).toBe('105');
  });

  it('flags an invalid draft without rewriting it, then restores the committed value on blur', () => {
    const { onCommit, field } = setup();
    type(field, '{selectall}0');
    expect(field.value).toBe('0');
    expect(field.getAttribute('aria-invalid')).toBe('true');

    blur(field);
    expect(field.value).toBe('60');
    expect(field.getAttribute('aria-invalid')).toBe('false');
    expect(onCommit).toHaveBeenLastCalledWith(60, 'blur');
  });

  it('commits on Enter', () => {
    const { onCommit, field } = setup();
    type(field, '{selectall}45{enter}');
    expect(onCommit).toHaveBeenLastCalledWith(45, 'blur');
    expect(document.activeElement).not.toBe(field);
  });

  it('commits spinner steps at once', () => {
    const { onCommit, field, committed } = setup();
    inputWithoutType(field, '59');
    expect(onCommit).toHaveBeenLastCalledWith(59, 'step');
    expect(committed()).toBe('59');
    expect(field.value).toBe('59');
  });

  it('keeps edits without an inputType as a draft unless they move one step', () => {
    const { onCommit, field, committed } = setup();
    focus(field);
    for (const value of ['', '2', '28']) inputWithoutType(field, value);
    expect(onCommit).not.toHaveBeenCalled();
    expect(field.value).toBe('28');

    blur(field);
    expect(onCommit).toHaveBeenLastCalledWith(28, 'blur');
    expect(committed()).toBe('28');
  });
});
