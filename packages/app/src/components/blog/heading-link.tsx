'use client';

import { useCallback, useState } from 'react';
import { LinkIcon, CheckIcon } from 'lucide-react';

export function HeadingLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [id],
  );

  return (
    <a
      href={`#${id}`}
      onClick={handleClick}
      aria-label="Copy link to section"
      className="inline-flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
    >
      {copied ? <CheckIcon className="size-4" /> : <LinkIcon className="size-4" />}
    </a>
  );
}
