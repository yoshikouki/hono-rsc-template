import { Hono } from "hono";
import { site, siteManifest } from "@/site";

const TRAILING_SLASH_RE = /\/$/;

const app = new Hono();

app.get("/", (c) => {
  const baseUrl = site.baseUrl.replace(TRAILING_SLASH_RE, "");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...siteManifest.map((entry) => {
      const lastmod = entry.date ? `<lastmod>${entry.date}</lastmod>` : "";
      return `  <url><loc>${baseUrl}${entry.path}</loc>${lastmod}</url>`;
    }),
    "</urlset>",
  ].join("\n");

  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

export default app;
