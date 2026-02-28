import type { RouteMeta } from "@/factory";

export const meta: RouteMeta = {
  title: "About",
  description: "About this template",
};

export default function AboutPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">About</h1>
      <p className="text-gray-600">This template demonstrates file-based routing with Hono + RSC.</p>
    </div>
  );
}
