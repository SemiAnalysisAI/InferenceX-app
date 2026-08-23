'use client';

import { useCallback, useState } from 'react';

/** Coordinates a group of controlled dropdowns so opening one closes the previous dropdown. */
export function useOpenDropdown<DropdownKey extends string>() {
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const handleDropdownOpenChange = useCallback(
    (dropdownKey: DropdownKey) => (isOpen: boolean) => {
      if (isOpen) {
        setOpenDropdown(dropdownKey);
        return;
      }
      setOpenDropdown((current) => (current === dropdownKey ? null : current));
    },
    [],
  );

  return { openDropdown, handleDropdownOpenChange } as const;
}
