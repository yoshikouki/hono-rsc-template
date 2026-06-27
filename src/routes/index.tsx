import { Hono } from "hono";
import { AppLayout } from "@/components/app-layout";
import { ClickCounter } from "@/components/click-counter";
import { ClientClock } from "@/components/client-clock";

function HomePage() {
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

const app = new Hono();

app.get("/", (c) =>
  c.render(
    <AppLayout>
      <HomePage />
    </AppLayout>,
    {
      description: "A Hono RSC template app",
      title: "Home",
    }
  )
);

export default app;
