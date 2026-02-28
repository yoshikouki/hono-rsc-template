import type { RouteMeta } from "@/factory";

export const meta: RouteMeta = {
  title: "Home",
  description: "A Hono RSC template app",
};

export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Welcome</h1>
      <p className="text-gray-600">This is a Hono + React Server Components template.</p>
    </div>
  );
}
