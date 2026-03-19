'use client';

import { track } from '@/lib/analytics';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { cn } from '@/lib/utils';

export function ModeToggle() {
  const { setTheme, theme } = useTheme();

  // Use state to track if component has mounted (client-side)
  const [mounted, setMounted] = React.useState(false);

  // Set mounted to true after component mounts (client-side)
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    track('theme_toggled', { theme: newTheme });
  };

  const buttonClasses = cn(
    'inline-flex items-center justify-center rounded-md p-2',
    'text-muted-foreground hover:text-foreground hover:bg-accent',
    'transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  );

  // Handle SSR/Client mismatch by not rendering theme-dependent content until mounted
  if (!mounted) {
    return (
      <button
        type="button"
        data-testid="theme-toggle"
        className={buttonClasses}
        aria-label="Switch between dark and light mode"
        onClick={toggleTheme}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
          <path d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z" />
        </svg>
      </button>
    );
  }

  const displayAriaLabel = `Switch between dark and light mode (currently ${theme} mode)`;

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      className={buttonClasses}
      aria-label={displayAriaLabel}
      onClick={toggleTheme}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
          <path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 1h2v3h-2V1zm0 19h2v3h-2v-3zM3.515 4.929l1.414-1.414L7.05 5.636 5.636 7.05 3.515 4.93zM16.95 18.364l1.414-1.414 2.121 2.121-1.414 1.414-2.121-2.121zm2.121-14.85l1.414 1.415-2.121 2.121-1.414-1.414 2.121-2.121zM5.636 16.95l1.414 1.414-2.121 2.121-1.414-1.414 2.121-2.121zM23 11v2h-3v-2h3zM4 11v2H1v-2h3z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
          <path d="M10 7a7 7 0 0 0 12 4.9v.1c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2h.1A6.979 6.979 0 0 0 10 7zm-6 5a8 8 0 0 0 15.062 3.762A9 9 0 0 1 8.238 4.938 7.999 7.999 0 0 0 4 12z" />
        </svg>
      )}
    </button>
  );
}
