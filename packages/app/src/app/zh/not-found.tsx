import Link from 'next/link';

export default function ZhNotFound() {
  return (
    <div className="flex flex-col items-center justify-center grow text-foreground">
      <h1 className="text-4xl font-bold mb-4">404 - 页面不存在</h1>
      <p className="text-lg mb-8">您访问的页面不存在。</p>
      <Link
        href="/zh"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        返回首页
      </Link>
    </div>
  );
}
