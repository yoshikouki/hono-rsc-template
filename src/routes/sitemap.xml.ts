import { Hono } from "hono";
import type { AppEnv } from "@/factory";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const manifest = c.var.routeManifest;
  const baseUrl = "https://example.com"; // TODO: derive from SiteConfig
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...manifest.map(
      (entry) =>
        `  <url><loc>${baseUrl}${entry.path}</loc>${entry.date ? `<lastmod>${entry.date}</lastmod>` : ""}</url>`,
    ),
    "</urlset>",
  ].join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
});

export default app;
