import type { ReactNode } from "react";

export function AboutLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="mb-4 flex gap-2 text-sm text-gray-500">
        <a className="hover:underline" href="/about">
          About
        </a>
      </nav>
      {children}
    </div>
  );
}
