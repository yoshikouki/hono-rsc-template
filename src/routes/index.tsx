import { ClickCounter } from "@/components/click-counter";
import { ClientClock } from "@/components/client-clock";
import type { RouteMeta } from "@/factory";

export const meta: RouteMeta = {
  title: "Home",
  description: "A Hono RSC template app",
};

export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Welcome</h1>
      <p className="text-gray-600 mb-8">
        This is a Hono + React Server Components template.
      </p>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Client Clock</h2>
          <ClientClock />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Click Counter</h2>
          <ClickCounter />
        </div>
      </section>
    </div>
  );
}
