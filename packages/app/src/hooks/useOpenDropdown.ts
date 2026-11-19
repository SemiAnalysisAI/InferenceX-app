'use client';

import { useCallback, useState } from 'react';

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
