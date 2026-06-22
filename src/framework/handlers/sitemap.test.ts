import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv, RouteManifestEntry, SiteConfig } from "../types";
import { createSitemapApp } from "./sitemap";

const ROOT_LOC_WITH_LASTMOD_RE =
  /<url><loc>https:\/\/example\.com\/<\/loc><lastmod>/;

const stubSite: SiteConfig = {
  baseUrl: "https://example.com",
  name: "Test Site",
};

const stubManifest: RouteManifestEntry[] = [
  { path: "/", title: "Home" },
  { path: "/about", title: "About", description: "About page" },
  { path: "/books/123", title: "Book 123", date: "2024-01-15" },
];

function makeTestApp(options?: Parameters<typeof createSitemapApp>[0]) {
  const outer = new Hono<AppEnv>();
  outer.use("*", async (c, next) => {
    c.set("site", stubSite);
    c.set("routeManifest", async () => stubManifest);
    c.set("markdownSources", new Map());
    await next();
  });
  outer.route("/sitemap.xml", createSitemapApp(options));
  return outer;
}

describe("createSitemapApp", () => {
  it("returns 200 with application/xml content type", async () => {
    const app = makeTestApp();
    const res = await app.request("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
  });

  it("includes XML declaration and urlset", async () => {
    const app = makeTestApp();
    const body = await (await app.request("/sitemap.xml")).text();
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
  });

  it("generates <loc> from baseUrl + path", async () => {
    const app = makeTestApp();
    const body = await (await app.request("/sitemap.xml")).text();
    expect(body).toContain("<loc>https://example.com/</loc>");
    expect(body).toContain("<loc>https://example.com/about</loc>");
    expect(body).toContain("<loc>https://example.com/books/123</loc>");
  });

  it("includes <lastmod> only when entry has date", async () => {
    const app = makeTestApp();
    const body = await (await app.request("/sitemap.xml")).text();
    expect(body).toContain("<lastmod>2024-01-15</lastmod>");
    // entries without date must not produce lastmod
    expect(body).not.toMatch(ROOT_LOC_WITH_LASTMOD_RE);
  });

  it("applies filter option to exclude entries", async () => {
    const app = makeTestApp({ filter: (e) => !e.path.startsWith("/books") });
    const body = await (await app.request("/sitemap.xml")).text();
    expect(body).not.toContain("/books/");
    expect(body).toContain("/about");
  });

  it("strips trailing slash from baseUrl to avoid double slash", async () => {
    const outer = new Hono<AppEnv>();
    outer.use("*", async (c, next) => {
      c.set("site", { ...stubSite, baseUrl: "https://example.com/" });
      c.set("routeManifest", async () => [{ path: "/", title: "Home" }]);
      c.set("markdownSources", new Map());
      await next();
    });
    outer.route("/sitemap.xml", createSitemapApp());
    const body = await (await outer.request("/sitemap.xml")).text();
    expect(body).toContain("<loc>https://example.com/</loc>");
    expect(body).not.toContain("//</loc>");
  });

  it("sets Cache-Control header", async () => {
    const app = makeTestApp();
    const res = await app.request("/sitemap.xml");
    expect(res.headers.get("Cache-Control")).toBeTruthy();
  });
});
