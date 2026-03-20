import { Hono } from "hono";
import type { AppEnv } from "@/factory";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const manifest = c.var.routeManifest;
  const lines = manifest.map(
    (entry) => `- [${entry.title}](${entry.path}): ${entry.description || ""}`,
  );
  const body = ["# Site Pages", "", ...lines].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});

export default app;
