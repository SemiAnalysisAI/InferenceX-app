import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="embed-root"
      className="relative w-full min-h-screen flex flex-col bg-background"
    >
      {children}
    </div>
  );
}
