export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 border-b pb-4">
        <nav className="flex gap-4">
          <a className="font-semibold hover:underline" href="/">
            Home
          </a>
          <a className="hover:underline" href="/about">
            About
          </a>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="mt-8 border-t pt-4 text-gray-500 text-sm">
        <p>Built with Hono + RSC</p>
      </footer>
    </div>
  );
}
