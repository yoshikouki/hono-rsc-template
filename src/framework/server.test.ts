import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { acceptsRsc, createApp } from "./server";
import type {
  LayoutLoader,
  RouteGlobs,
  RouteMeta,
  RouteModule,
  SiteConfig,
} from "./types";

const baseSite: SiteConfig = {
  baseUrl: "https://example.com",
  name: "Test",
};

const stubRenderRsc = vi.fn(async () => new ReadableStream());
const stubRenderHtml = vi.fn(
  async (_stream: ReadableStream, _opts: { signal: AbortSignal }) =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>stub</html>"));
        controller.close();
      },
    })
);

const stubRenderer = {
  renderRsc: stubRenderRsc,
  renderHtml: stubRenderHtml,
};

const layoutLoader: LayoutLoader = async () => ({
  default: ({ children }) => children as React.ReactElement,
});

function makePageLoader(title: string, extra: Partial<RouteMeta> = {}) {
  return async (): Promise<RouteModule> => ({
    default: () => createElement("div", null, title),
    meta: { title, ...extra },
  });
}

function makeGlobs(overrides: Partial<RouteGlobs> = {}): RouteGlobs {
  return {
    metas: { "./routes/index.tsx": { title: "Home" } },
    pages: { "./routes/index.tsx": makePageLoader("Home") },
    layouts: { "./routes/layout.tsx": layoutLoader },
    contents: {},
    handlers: {},
    ...overrides,
  };
}

describe("acceptsRsc", () => {
  it("returns true when Accept contains text/x-component", () => {
    const req = new Request("https://example.com/", {
      headers: { Accept: "text/x-component" },
    });
    expect(acceptsRsc(req)).toBe(true);
  });

  it("returns false for normal HTML request", () => {
    const req = new Request("https://example.com/");
    expect(acceptsRsc(req)).toBe(false);
  });
});

describe("createApp", () => {
  it("returns text/x-component for RSC Accept header", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/", {
      headers: { Accept: "text/x-component" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/x-component");
  });

  it("returns text/html for normal request", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("sets Vary: Accept on page responses", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/");
    expect(res.headers.get("Vary")).toBe("Accept");
  });

  it("sets Speculation-Rules on HTML response", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/");
    expect(res.headers.get("Speculation-Rules")).toBe(
      '"/speculationrules.json"'
    );
  });

  it("does not set Speculation-Rules on RSC response", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/", {
      headers: { Accept: "text/x-component" },
    });
    expect(res.headers.get("Speculation-Rules")).toBeNull();
  });

  it("sets Cache-Control when route has cacheControl meta", async () => {
    const globs = makeGlobs({
      metas: {
        "./routes/index.tsx": {
          title: "Home",
          cacheControl: "public, max-age=3600",
        },
      },
      pages: {
        "./routes/index.tsx": makePageLoader("Home", {
          cacheControl: "public, max-age=3600",
        }),
      },
    });
    const app = createApp({ site: baseSite, globs, renderer: stubRenderer });
    const res = await app.request("/");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("returns markdown for .md route", async () => {
    const globs = makeGlobs({
      metas: {
        "./routes/index.tsx": { title: "Home", markdown: () => "# Home" },
      },
      pages: {
        "./routes/index.tsx": makePageLoader("Home", {
          markdown: () => "# Home",
        }),
      },
    });
    const app = createApp({ site: baseSite, globs, renderer: stubRenderer });
    const res = await app.request("/index.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("returns 404 for .md route when no markdown export", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/index.md");
    expect(res.status).toBe(404);
  });

  it("returns markdown for content .md route", async () => {
    const raw = "---\ntitle: Hello\n---\nBody";
    const globs = makeGlobs({
      contents: { "./routes/hello.md": raw },
    });
    const app = createApp({
      site: baseSite,
      globs,
      renderer: stubRenderer,
    });
    const res = await app.request("/hello.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("routes handler paths", async () => {
    const { Hono } = await import("hono");
    const handler = new Hono();
    handler.get("/", (c) => c.text("ok"));
    const globs = makeGlobs({
      handlers: { "./routes/healthz.ts": handler },
    });
    const app = createApp({ site: baseSite, globs, renderer: stubRenderer });
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("ok");
  });

  it("returns 404 for unknown route without notFound", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 404 with rendered page when notFound is provided", async () => {
    const notFound = makePageLoader("Not Found");
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      notFound,
      renderer: stubRenderer,
    });
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("returns RSC 404 for unknown route with Accept: text/x-component", async () => {
    const notFound = makePageLoader("Not Found");
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      notFound,
      renderer: stubRenderer,
    });
    const res = await app.request("/does-not-exist", {
      headers: { Accept: "text/x-component" },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/x-component");
  });

  it("returns 500 and logs error on unhandled exception", async () => {
    const errorRenderer = {
      renderRsc: vi.fn(() => Promise.reject(new Error("render failed"))),
      renderHtml: stubRenderHtml,
    };
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op mock
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: errorRenderer,
    });
    const res = await app.request("/");
    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toBe("Internal Server Error");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("exposes routeManifest and markdownSources via a handler that reads context", async () => {
    let capturedManifest: unknown;
    let capturedSources: unknown;
    const { Hono } = await import("hono");
    // Build a wrapper app that sets up context-capturing middleware, then mounts createApp
    const outer = new Hono<import("./types").AppEnv>();
    const globs = makeGlobs();
    const inner = createApp({ site: baseSite, globs, renderer: stubRenderer });
    outer.use("*", async (c, next) => {
      await next();
      capturedManifest = c.var.routeManifest;
      capturedSources = c.var.markdownSources;
    });
    outer.route("/", inner);
    await outer.request("/");
    expect(Array.isArray(capturedManifest)).toBe(true);
    expect(capturedSources instanceof Map).toBe(true);
  });
});
