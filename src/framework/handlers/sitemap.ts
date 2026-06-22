import { Hono } from "hono";
import type { AppEnv, RouteManifestEntry } from "../types";

const TRAILING_SLASH_RE = /\/$/;

export interface SitemapOptions {
  filter?: (entry: RouteManifestEntry) => boolean;
}

export function createSitemapApp(options?: SitemapOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const manifest = await c.var.routeManifest();
    const baseUrl = c.var.site.baseUrl.replace(TRAILING_SLASH_RE, "");

    const entries = options?.filter
      ? manifest.filter(options.filter)
      : manifest;

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map((entry) => {
        const lastmod = entry.date ? `<lastmod>${entry.date}</lastmod>` : "";
        return `  <url><loc>${baseUrl}${entry.path}</loc>${lastmod}</url>`;
      }),
      "</urlset>",
    ].join("\n");

    c.header("Content-Type", "application/xml; charset=utf-8");
    return c.body(xml);
  });

  return app;
}
