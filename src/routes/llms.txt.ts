import { Hono } from "hono";
import { siteManifest } from "@/site";

const app = new Hono();

app.get("/", () => {
  const lines = siteManifest.map(
    (entry) => `- [${entry.title}](${entry.path}): ${entry.description ?? ""}`
  );
  const body = ["# Site Pages", "", ...lines].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});

export default app;
