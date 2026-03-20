import type { MiddlewareHandler } from "hono";
import { describe, expect, it, vi } from "vitest";
import { type AppEnv, createApp } from "../index";
import { testGlobs } from "./test-globs";

const site = { baseUrl: "https://example.com", name: "Test", lang: "en" };

// Stub middleware that sets a no-op renderPage
const stubMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("renderPage", async () => new Response("stub", { status: 200 }));
  await next();
};

describe("app request specs", () => {
  const app = createApp({
    site,
    middlewares: { rsc: stubMiddleware, ssr: stubMiddleware },
    globs: testGlobs,
    notFoundPage: () =>
      Promise.resolve({
        default: () => null as unknown as React.ReactElement,
        meta: { title: "Not Found" },
      }),
  });

  // Handler routes
  it("GET /healthz returns 200", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("ok");
  });

  it("GET /robots.txt returns text/plain", async () => {
    const res = await app.request("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("GET /sitemap.xml returns application/xml", async () => {
    const res = await app.request("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
  });

  it("GET /llms.txt returns text/plain", async () => {
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("GET /speculationrules.json returns JSON", async () => {
    const res = await app.request("/speculationrules.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // Page routes (stub renderPage returns "stub")
  it("GET / returns 200 via stub renderPage", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("stub");
  });

  // Markdown endpoint
  it("GET /hello.md returns markdown for content page", async () => {
    const res = await app.request("/hello.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-signal")).toBe("search=yes ai-input=yes");
  });

  it("GET /about.md returns 404 when page has no markdown", async () => {
    const res = await app.request("/about.md");
    expect(res.status).toBe(404);
  });

  // 404 handler
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toBe("stub");
  });

  // Error handling
  it("returns 500 on unhandled error", async () => {
    const errorMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
      c.set("renderPage", () => {
        throw new Error("test error");
      });
      await next();
    };
    const errorApp = createApp({
      site,
      middlewares: { rsc: errorMiddleware, ssr: errorMiddleware },
      globs: testGlobs,
    });
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op mock
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await errorApp.request("/");

    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toBe("Internal Server Error");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // Speculation Rules header on HTML responses
  it("adds Speculation-Rules header to HTML responses", async () => {
    const htmlMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
      c.set(
        "renderPage",
        async () =>
          new Response("<html>", {
            status: 200,
            headers: { "Content-Type": "text/html;charset=utf-8" },
          })
      );
      await next();
    };
    const htmlApp = createApp({
      site,
      middlewares: { rsc: htmlMiddleware, ssr: htmlMiddleware },
      globs: testGlobs,
    });

    const res = await htmlApp.request("/");
    expect(res.headers.get("speculation-rules")).toBe(
      '"/speculationrules.json"'
    );
  });

  // defaultJsonLd wiring
  it("invokes defaultJsonLd callback with page context during request", async () => {
    const spy = vi.fn(() => [{ "@type": "WebSite" }]);
    const jsonLdApp = createApp({
      site: { ...site, defaultJsonLd: spy },
      middlewares: { rsc: stubMiddleware, ssr: stubMiddleware },
      globs: testGlobs,
    });

    await jsonLdApp.request("/");

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/", title: expect.any(String) })
    );
  });
});
