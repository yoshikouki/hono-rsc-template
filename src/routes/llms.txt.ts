import { Hono } from "hono";
import type { AppEnv } from "@/framework/types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const manifest = await c.var.routeManifest();
  const lines = manifest.map(
    (entry) => `- [${entry.title}](${entry.path}): ${entry.description ?? ""}`
  );
  const body = ["# Site Pages", "", ...lines].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});

export default app;
