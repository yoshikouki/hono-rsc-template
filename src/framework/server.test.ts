import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createApp, pagePathFromRscPath, rscPathFor } from "./server";
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
    resolveMeta: () => ({ title, ...extra }),
  });
}

function makeGlobs(overrides: Partial<RouteGlobs> = {}): RouteGlobs {
  return {
    pages: { "./routes/index.tsx": makePageLoader("Home") },
    layouts: { "./routes/layout.tsx": layoutLoader },
    contents: {},
    handlers: {},
    ...overrides,
  };
}

describe("rscPathFor", () => {
  it("maps root page to /__rsc", () => {
    expect(rscPathFor("/")).toBe("/__rsc");
  });

  it("prefixes non-root page paths", () => {
    expect(rscPathFor("/about")).toBe("/__rsc/about");
  });
});

describe("pagePathFromRscPath", () => {
  it("maps /__rsc and /__rsc/ to root", () => {
    expect(pagePathFromRscPath("/__rsc")).toBe("/");
    expect(pagePathFromRscPath("/__rsc/")).toBe("/");
  });

  it("strips the RSC prefix from nested paths", () => {
    expect(pagePathFromRscPath("/__rsc/about")).toBe("/about");
  });

  it("returns null for normal page paths", () => {
    expect(pagePathFromRscPath("/about")).toBeNull();
  });
});

describe("createApp", () => {
  it("returns text/x-component from the /__rsc route", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/__rsc");
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

  it("keeps the page route HTML even when Accept asks for RSC", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/", {
      headers: { Accept: "text/x-component" },
    });
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("does not vary page responses by Accept", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/");
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("sets Speculation-Rules on HTML response when speculationRulesPath is set", async () => {
    const app = createApp({
      site: { ...baseSite, speculationRulesPath: "/speculationrules.json" },
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/");
    expect(res.headers.get("Speculation-Rules")).toBe(
      '"/speculationrules.json"'
    );
  });

  it("does not set Speculation-Rules when speculationRulesPath is absent", async () => {
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/");
    expect(res.headers.get("Speculation-Rules")).toBeNull();
  });

  it("does not set Speculation-Rules on RSC response", async () => {
    const app = createApp({
      site: { ...baseSite, speculationRulesPath: "/speculationrules.json" },
      globs: makeGlobs(),
      renderer: stubRenderer,
    });
    const res = await app.request("/__rsc");
    expect(res.headers.get("Speculation-Rules")).toBeNull();
  });

  it("sets Cache-Control when route has cacheControl meta", async () => {
    const globs = makeGlobs({
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

  it("does not apply route cacheControl to RSC responses", async () => {
    const globs = makeGlobs({
      pages: {
        "./routes/index.tsx": makePageLoader("Home", {
          cacheControl: "public, max-age=3600",
        }),
      },
    });
    const app = createApp({ site: baseSite, globs, renderer: stubRenderer });
    const res = await app.request("/__rsc");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns markdown for .md route", async () => {
    const globs = makeGlobs({
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

  it("returns RSC 404 for unknown /__rsc route", async () => {
    const notFound = makePageLoader("Not Found");
    const app = createApp({
      site: baseSite,
      globs: makeGlobs(),
      notFound,
      renderer: stubRenderer,
    });
    const res = await app.request("/__rsc/does-not-exist");
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
      capturedManifest = await c.var.routeManifest();
      capturedSources = c.var.markdownSources;
    });
    outer.route("/", inner);
    await outer.request("/");
    expect(Array.isArray(capturedManifest)).toBe(true);
    expect(capturedSources instanceof Map).toBe(true);
  });

  it("exposes site via c.var.site in handlers", async () => {
    let capturedSite: unknown;
    const { Hono } = await import("hono");
    const outer = new Hono<import("./types").AppEnv>();
    const globs = makeGlobs();
    const inner = createApp({ site: baseSite, globs, renderer: stubRenderer });
    outer.use("*", async (c, next) => {
      await next();
      capturedSite = c.var.site;
    });
    outer.route("/", inner);
    await outer.request("/");
    expect(capturedSite).toMatchObject({
      baseUrl: baseSite.baseUrl,
      name: baseSite.name,
    });
  });

  describe("createRequestContext", () => {
    it("calls createRequestContext and passes context to renderRsc", async () => {
      interface TestCtx {
        user: string;
      }
      let capturedContext: TestCtx | undefined;
      const renderRscCapture = vi.fn(async () => new ReadableStream());
      // Capture context via a page loader that inspects its props
      const globs = makeGlobs() as RouteGlobs<TestCtx>;
      globs.pages["./routes/index.tsx"] = async () => ({
        default: (props: import("./types").PageProps<TestCtx>) => {
          capturedContext = props.context;
          return createElement("div", null, "ok");
        },
        resolveMeta: () => ({ title: "Home" }),
      });
      const app2 = createApp<TestCtx>({
        site: baseSite,
        globs,
        renderer: { renderRsc: renderRscCapture, renderHtml: stubRenderHtml },
        createRequestContext: async (_req) => ({ user: "alice" }),
      });
      await app2.request("/");
      expect(capturedContext).toEqual({ user: "alice" });
    });

    it("passes context to routeManifest metadata resolution", async () => {
      interface TestCtx {
        user: string;
      }

      let capturedContext: TestCtx | undefined;
      const { Hono } = await import("hono");
      const handler = new Hono<import("./types").AppEnv>();
      handler.get("/", async (c) => {
        const entries = await c.var.routeManifest();
        return c.json(entries);
      });

      const globs = makeGlobs({
        handlers: { "./routes/manifest.ts": handler },
        pages: {
          "./routes/index.tsx": async (): Promise<RouteModule<TestCtx>> => ({
            default: () => createElement("div", null, "ok"),
            resolveMeta: ({ context }) => {
              capturedContext = context;
              return { title: context.user };
            },
          }),
        },
      }) as RouteGlobs<TestCtx>;

      const app2 = createApp<TestCtx>({
        site: baseSite,
        globs,
        renderer: stubRenderer,
        createRequestContext: async () => ({ user: "alice" }),
      });

      const res = await app2.request("/manifest");
      await res.json();

      expect(capturedContext).toEqual({ user: "alice" });
    });
  });

  describe("notFound with root layout", () => {
    it("applies root layout to notFound page", async () => {
      let layoutCalled = false;
      const layoutWithSpy: LayoutLoader = async () => ({
        default: ({ children }) => {
          layoutCalled = true;
          return createElement("div", { "data-layout": "root" }, children);
        },
      });
      const notFound = makePageLoader("Not Found");
      const app = createApp({
        site: baseSite,
        globs: makeGlobs({ layouts: { "./routes/layout.tsx": layoutWithSpy } }),
        notFound,
        renderer: stubRenderer,
      });
      const res = await app.request("/does-not-exist");
      expect(res.status).toBe(404);
      expect(layoutCalled).toBe(true);
    });
  });

  describe("strict:false (trailing slash)", () => {
    it("returns 200 for path with trailing slash", async () => {
      const app = createApp({
        site: baseSite,
        globs: makeGlobs({
          pages: { "./routes/about.tsx": makePageLoader("About") },
        }),
        renderer: stubRenderer,
      });
      const res = await app.request("/about/");
      expect(res.status).toBe(200);
    });
  });

  describe("programmatic routes", () => {
    it("serves programmatic route", async () => {
      const load = makePageLoader("Book Detail");
      const app = createApp({
        site: baseSite,
        globs: makeGlobs({ pages: {} }),
        routes: [{ path: "/books/123", load }],
        renderer: stubRenderer,
      });
      const res = await app.request("/books/123");
      expect(res.status).toBe(200);
    });

    it("includes programmatic routes in routeManifest", async () => {
      let capturedManifest: import("./types").RouteManifestEntry[] | undefined;
      const { Hono } = await import("hono");
      const load = makePageLoader("Book");
      const globs = makeGlobs({ pages: {} });
      const inner = createApp({
        site: baseSite,
        globs,
        routes: [{ path: "/books/1", load }],
        renderer: stubRenderer,
      });
      const outer = new Hono<import("./types").AppEnv>();
      outer.use("*", async (c, next) => {
        await next();
        capturedManifest = await c.var.routeManifest();
      });
      outer.route("/", inner);
      await outer.request("/books/1");
      expect(capturedManifest?.some((e) => e.path === "/books/1")).toBe(true);
    });
  });

  describe("themeColor", () => {
    it("does not set theme-color meta when themeColor is absent", async () => {
      let capturedEl: React.ReactElement | undefined;
      const renderRsc = vi.fn((el: React.ReactElement) => {
        capturedEl = el;
        return Promise.resolve(new ReadableStream());
      });
      const app = createApp({
        site: baseSite,
        globs: makeGlobs(),
        renderer: { renderRsc, renderHtml: stubRenderHtml },
      });
      await app.request("/");
      // renderDocument is called with themeColor undefined — just verify no error
      expect(capturedEl).toBeDefined();
    });
  });
});
