export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <nav className="mb-4 flex gap-2 text-gray-500 text-sm">
        <a className="hover:underline" href="/about">
          About
        </a>
      </nav>
      {children}
    </div>
  );
}
