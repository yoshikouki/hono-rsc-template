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
      <h1 className="mb-4 font-bold text-3xl">Welcome</h1>
      <p className="mb-8 text-gray-600">
        This is a Hono + React Server Components template.
      </p>

      <section className="space-y-6">
        <div>
          <h2 className="mb-2 font-semibold text-xl">Client Clock</h2>
          <ClientClock />
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-xl">Click Counter</h2>
          <ClickCounter />
        </div>
      </section>
    </div>
  );
}
