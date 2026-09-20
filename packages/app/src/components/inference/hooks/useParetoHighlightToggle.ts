import { useCallback, useState } from 'react';

/** Each new switch-on alternates plain and playful; switching off always hides it. */
export function useParetoHighlightToggle(initialParam: string | null | undefined = '') {
  const [state, setState] = useState(() => ({
    visible: initialParam === '1' || initialParam === '2',
    playful: initialParam === '2',
    hasEnabled: initialParam === '1' || initialParam === '2',
  }));
  const setVisible = useCallback((visible: boolean) => {
    setState((previous) => {
      if (previous.visible === visible) return previous;
      return {
        visible,
        playful: visible && previous.hasEnabled ? !previous.playful : previous.playful,
        hasEnabled: previous.hasEnabled || visible,
      };
    });
  }, []);
  return { visible: state.visible, playful: state.playful, setVisible };
}
