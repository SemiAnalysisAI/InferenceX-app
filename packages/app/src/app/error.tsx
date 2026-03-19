'use client'; // Error components must be Client Components
import { useEffect } from 'react';

import { track } from '@/lib/analytics';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    track('error_page_shown', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-foreground">
      <h2 className="text-4xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-lg mb-4">An unexpected error has occurred.</p>
      <p className="text-md text-red-500 mb-8">{error.message}</p>
      <button
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        onClick={() => {
          track('error_page_retry');
          reset();
        }}
      >
        Try again
      </button>
    </div>
  );
}
