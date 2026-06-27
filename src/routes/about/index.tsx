import { Hono } from "hono";
import { AboutLayout } from "@/components/about-layout";
import { AppLayout } from "@/components/app-layout";

function AboutPage() {
  return (
    <div>
      <h1 className="mb-4 font-bold text-3xl">About</h1>
      <p className="text-gray-600">
        This template demonstrates file-based routing with Hono + RSC.
      </p>
    </div>
  );
}

const app = new Hono();

app.get("/", (c) =>
  c.render(
    <AppLayout>
      <AboutLayout>
        <AboutPage />
      </AboutLayout>
    </AppLayout>,
    {
      description: "About this template",
      title: "About",
    }
  )
);

export default app;
