import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center grow text-foreground">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-lg mb-8">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        Go back home
      </Link>
    </div>
  );
}
