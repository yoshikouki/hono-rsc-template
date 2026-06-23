import { describe, expect, it, vi } from "vitest";
import type { MarkdownAdapter } from "./content/markdown";
import {
  buildManifest,
  resolveLayoutChain,
  routeFileToManifestPath,
  routePathsOverlap,
  routePathToShape,
  sortRoutesBySpecificity,
  toMarkdownPath,
} from "./manifest";
import type { LayoutLoader, RouteMeta, RouteModule } from "./types";

const RE_STUB_TITLE = /^---\ntitle: ([^\n]*)\n/;
const RE_STUB_DRAFT = /draft: true/;
const RE_DUPLICATE_ROUTE = /Duplicate route/;
const RE_DUPLICATE_HANDLER = /Duplicate handler route/;
const RE_UNSUPPORTED_DYNAMIC_ROUTE = /Unsupported dynamic route segment/;
const RE_MARKDOWN_DYNAMIC_ROUTE =
  /Markdown routes do not support dynamic segments/;

const stubAdapter: MarkdownAdapter = (raw, path) => {
  const fm = raw.match(RE_STUB_TITLE);
  const draftMatch = raw.match(RE_STUB_DRAFT);
  const title = fm?.[1]?.trim() || path;
  const meta: RouteMeta = {
    title,
    markdown: () => raw,
    draft: draftMatch ? true : undefined,
  };
  return {
    meta,
    load: async () => ({
      default: () => null as unknown as React.ReactElement,
      resolveMeta: () => meta,
    }),
  };
};

const layoutLoader: LayoutLoader = async () => ({
  default: ({ children }) => children as React.ReactElement,
});

const makePageLoader = (title: string) => async (): Promise<RouteModule> => ({
  default: () => null as unknown as React.ReactElement,
  resolveMeta: () => ({ title }),
});

describe("toMarkdownPath", () => {
  it("converts / to /index.md", () => {
    expect(toMarkdownPath("/")).toBe("/index.md");
  });

  it("appends .md to other paths", () => {
    expect(toMarkdownPath("/about")).toBe("/about.md");
  });
});

describe("resolveLayoutChain", () => {
  it("returns outer-to-inner layouts for nested routes", () => {
    const chain = resolveLayoutChain("/about/career", {
      "../routes/layout.tsx": layoutLoader,
      "../routes/about/layout.tsx": layoutLoader,
      "../routes/about/career/layout.tsx": layoutLoader,
    });
    expect(chain.map((l) => l.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/about/layout.tsx",
      "../routes/about/career/layout.tsx",
    ]);
  });

  it("includes directory layout for index page", () => {
    const chain = resolveLayoutChain("/about", {
      "../routes/layout.tsx": layoutLoader,
      "../routes/about/layout.tsx": layoutLoader,
    });
    expect(chain.map((l) => l.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/about/layout.tsx",
    ]);
  });

  it("returns root layout for top-level route", () => {
    const chain = resolveLayoutChain("/", {
      "../routes/layout.tsx": layoutLoader,
    });
    expect(chain.map((l) => l.file)).toEqual(["../routes/layout.tsx"]);
  });

  it("supports ./routes/ prefix as well", () => {
    const chain = resolveLayoutChain("/", {
      "./routes/layout.tsx": layoutLoader,
    });
    expect(chain.map((l) => l.file)).toEqual(["./routes/layout.tsx"]);
  });
});

describe("routeFileToManifestPath", () => {
  it("converts [partyId] to :partyId", () => {
    expect(
      routeFileToManifestPath(
        "../routes/app/parties/[partyId]/index.tsx",
        ".tsx"
      )
    ).toEqual({
      path: "/app/parties/:partyId",
      routeDirectory: "app/parties/[partyId]",
    });
  });

  it("converts nested dynamic segments", () => {
    expect(
      routeFileToManifestPath(
        "../routes/app/parties/[partyId]/events/[eventId]/reception.tsx",
        ".tsx"
      )
    ).toEqual({
      path: "/app/parties/:partyId/events/:eventId/reception",
      routeDirectory: "app/parties/[partyId]/events/[eventId]",
    });
  });

  it("removes trailing index segments", () => {
    expect(routeFileToManifestPath("../routes/app/index.tsx", ".tsx")).toEqual({
      path: "/app",
      routeDirectory: "app",
    });
  });

  it("throws on catch-all dynamic segments", () => {
    expect(() =>
      routeFileToManifestPath("../routes/blog/[...slug]/index.tsx", ".tsx")
    ).toThrow(RE_UNSUPPORTED_DYNAMIC_ROUTE);
  });

  it("throws on optional dynamic segments", () => {
    expect(() =>
      routeFileToManifestPath("../routes/blog/[[slug]]/index.tsx", ".tsx")
    ).toThrow(RE_UNSUPPORTED_DYNAMIC_ROUTE);
  });
});

describe("routePathToShape", () => {
  it("normalizes dynamic param names", () => {
    expect(routePathToShape("/users/:id/books/:bookId")).toBe(
      "/users/:param/books/:param"
    );
    expect(routePathToShape("/users/:name/books/:slug")).toBe(
      "/users/:param/books/:param"
    );
  });
});

describe("routePathsOverlap", () => {
  it("returns true for dynamic routes that subsume static routes", () => {
    expect(routePathsOverlap("/users/:id", "/users/settings")).toBe(true);
    expect(routePathsOverlap("/users/settings", "/users/:id")).toBe(true);
  });

  it("returns true for routes that can match the same URL", () => {
    expect(routePathsOverlap("/users/:id/settings", "/users/foo/:tab")).toBe(
      true
    );
  });

  it("returns false for different static segments or segment lengths", () => {
    expect(routePathsOverlap("/users/:id", "/teams/settings")).toBe(false);
    expect(routePathsOverlap("/users/:id", "/users/:id/settings")).toBe(false);
  });
});

describe("sortRoutesBySpecificity", () => {
  it("orders static sibling routes before dynamic routes", () => {
    const routes = [
      { path: "/users/:id" },
      { path: "/users/settings" },
      { path: "/users/:id/events/:eventId" },
      { path: "/users/:id/events/settings" },
    ];

    expect(sortRoutesBySpecificity(routes).map((route) => route.path)).toEqual([
      "/users/settings",
      "/users/:id/events/settings",
      "/users/:id/events/:eventId",
      "/users/:id",
    ]);
  });

  it("keeps stable ordering for routes with equal specificity", () => {
    const routes = [{ path: "/about" }, { path: "/contact" }];
    expect(sortRoutesBySpecificity(routes)).toEqual(routes);
  });
});

describe("buildManifest", () => {
  const opts = { markdownAdapter: stubAdapter };

  it("builds route graph from tsx pages without loading page modules", () => {
    const load = vi.fn(makePageLoader("About"));
    const manifest = buildManifest(
      {
        pages: { "../routes/about.tsx": load },
        layouts: {},
        contents: {},
        handlers: {},
      },
      opts
    );

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].path).toBe("/about");
    expect(manifest.routes[0].load).toBe(load);
    expect(load).not.toHaveBeenCalled();
  });

  it("throws on duplicate tsx routes", () => {
    expect(() =>
      buildManifest(
        {
          pages: {
            "../routes/about.tsx": makePageLoader("A"),
            "../routes/about/index.tsx": makePageLoader("B"),
          },
          layouts: {},
          contents: {},
          handlers: {},
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("builds routes from md contents", async () => {
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: { "../routes/hello.md": "---\ntitle: Hello\n---\nBody" },
        handlers: {},
      },
      opts
    );

    expect(manifest.routes[0].path).toBe("/hello");
    await expect(manifest.routes[0].load()).resolves.toMatchObject({
      resolveMeta: expect.any(Function),
    });
  });

  it("populates markdownSources for md contents", async () => {
    const raw = "---\ntitle: Hello\n---\nBody";
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: { "../routes/hello.md": raw },
        handlers: {},
      },
      opts
    );
    expect(manifest.markdownSources.has("/hello")).toBe(true);
    expect(await manifest.markdownSources.get("/hello")?.()).toBe(raw);
  });

  it("excludes draft content when filterDrafts is true", () => {
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: {
          "../routes/draft.md": "---\ntitle: Draft\ndraft: true\n---\nBody",
        },
        handlers: {},
      },
      { ...opts, filterDrafts: true }
    );
    expect(manifest.routes).toHaveLength(0);
  });

  it("includes draft content when filterDrafts is false", () => {
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: {
          "../routes/draft.md": "---\ntitle: Draft\ndraft: true\n---\nBody",
        },
        handlers: {},
      },
      { ...opts, filterDrafts: false }
    );
    expect(manifest.routes).toHaveLength(1);
  });

  it("tsx wins over md on same path (md skipped)", () => {
    const manifest = buildManifest(
      {
        pages: { "../routes/hello.tsx": makePageLoader("TSX Hello") },
        layouts: {},
        contents: { "../routes/hello.md": "---\ntitle: MD Hello\n---\nBody" },
        handlers: {},
      },
      opts
    );
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].path).toBe("/hello");
    expect(manifest.markdownSources.has("/hello")).toBe(false);
  });

  it("stores resolved layout chain with routes", () => {
    const manifest = buildManifest(
      {
        pages: { "../routes/about/career.tsx": makePageLoader("Career") },
        layouts: {
          "../routes/layout.tsx": layoutLoader,
          "../routes/about/layout.tsx": layoutLoader,
        },
        contents: {},
        handlers: {},
      },
      opts
    );
    const route = manifest.routes.find((r) => r.path === "/about/career");
    expect(route?.layouts.map((l) => l.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/about/layout.tsx",
    ]);
  });

  it("resolves dynamic route layouts from route file directories", () => {
    const manifest = buildManifest(
      {
        pages: {
          "../routes/app/parties/[partyId]/index.tsx": makePageLoader("Party"),
        },
        layouts: {
          "../routes/layout.tsx": layoutLoader,
          "../routes/app/layout.tsx": layoutLoader,
          "../routes/app/parties/layout.tsx": layoutLoader,
          "../routes/app/parties/[partyId]/layout.tsx": layoutLoader,
        },
        contents: {},
        handlers: {},
      },
      opts
    );
    const route = manifest.routes.find(
      (r) => r.path === "/app/parties/:partyId"
    );
    expect(route?.layouts.map((l) => l.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/app/layout.tsx",
      "../routes/app/parties/layout.tsx",
      "../routes/app/parties/[partyId]/layout.tsx",
    ]);
  });

  it("throws on duplicate dynamic tsx routes", () => {
    expect(() =>
      buildManifest(
        {
          pages: {
            "../routes/users/[id].tsx": makePageLoader("A"),
            "../routes/users/[name].tsx": makePageLoader("B"),
          },
          layouts: {},
          contents: {},
          handlers: {},
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("sorts static page siblings before dynamic page siblings", () => {
    const manifest = buildManifest(
      {
        pages: {
          "../routes/users/[id].tsx": makePageLoader("User"),
          "../routes/users/settings.tsx": makePageLoader("Settings"),
        },
        layouts: {},
        contents: {},
        handlers: {},
      },
      opts
    );

    expect(manifest.routes.map((route) => route.path)).toEqual([
      "/users/settings",
      "/users/:id",
    ]);
  });

  it("keeps static page siblings first when they are discovered first", () => {
    const manifest = buildManifest(
      {
        pages: {
          "../routes/users/settings.tsx": makePageLoader("Settings"),
          "../routes/users/[id].tsx": makePageLoader("User"),
        },
        layouts: {},
        contents: {},
        handlers: {},
      },
      opts
    );

    expect(manifest.routes.map((route) => route.path)).toEqual([
      "/users/settings",
      "/users/:id",
    ]);
  });

  it("throws on duplicate handler routes", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: {},
          layouts: {},
          contents: {},
          handlers: {
            "../routes/healthz.ts": fakeApp,
            "../routes/healthz/index.ts": fakeApp,
          },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_HANDLER);
  });

  it("builds dynamic handler routes with the same file path conversion", () => {
    const fakeApp = {} as import("hono").Hono;
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: {},
        handlers: {
          "../routes/app/parties/[partyId]/events/[eventId].ts": fakeApp,
        },
      },
      opts
    );
    expect(manifest.handlers[0].path).toBe(
      "/app/parties/:partyId/events/:eventId"
    );
  });

  it("throws on duplicate handler route shapes with different param names", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: {},
          layouts: {},
          contents: {},
          handlers: {
            "../routes/users/[id].ts": fakeApp,
            "../routes/users/[name].ts": fakeApp,
          },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_HANDLER);
  });

  it("sorts static handler siblings before dynamic handler siblings", () => {
    const fakeApp = {} as import("hono").Hono;
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: {},
        handlers: {
          "../routes/users/[id].ts": fakeApp,
          "../routes/users/settings.ts": fakeApp,
        },
      },
      opts
    );

    expect(manifest.handlers.map((handler) => handler.path)).toEqual([
      "/users/settings",
      "/users/:id",
    ]);
  });

  it("throws on duplicate static page and handler route shapes", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: { "../routes/users/settings.tsx": makePageLoader("Settings") },
          layouts: {},
          contents: {},
          handlers: { "../routes/users/settings.ts": fakeApp },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws on duplicate dynamic page and handler route shapes", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: { "../routes/users/[id].tsx": makePageLoader("User") },
          layouts: {},
          contents: {},
          handlers: { "../routes/users/[id].ts": fakeApp },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws on duplicate page and handler route shapes with different param names", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: { "../routes/users/[id].tsx": makePageLoader("User") },
          layouts: {},
          contents: {},
          handlers: { "../routes/users/[name].ts": fakeApp },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws when a dynamic page route overlaps a static handler route", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: { "../routes/users/[id].tsx": makePageLoader("User") },
          layouts: {},
          contents: {},
          handlers: { "../routes/users/settings.ts": fakeApp },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws when a dynamic handler route overlaps a static page route", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: { "../routes/users/settings.tsx": makePageLoader("Settings") },
          layouts: {},
          contents: {},
          handlers: { "../routes/users/[id].ts": fakeApp },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws when a dynamic programmatic route overlaps a static handler route", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: {},
          layouts: {},
          contents: {},
          handlers: { "../routes/users/settings.ts": fakeApp },
        },
        {
          ...opts,
          routes: [{ path: "/users/:id", load: makePageLoader("User") }],
        }
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws when a static markdown route overlaps a dynamic handler route", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: {},
          layouts: {},
          contents: {
            "../routes/users/settings.md": "---\ntitle: Settings\n---\nBody",
          },
          handlers: { "../routes/users/[id].ts": fakeApp },
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("throws when a dynamic page route overlaps a static markdown route", () => {
    expect(() =>
      buildManifest(
        {
          pages: { "../routes/users/[id].tsx": makePageLoader("User") },
          layouts: {},
          contents: {
            "../routes/users/settings.md": "---\ntitle: Settings\n---\nBody",
          },
          handlers: {},
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("allows unrelated page and handler routes", () => {
    const fakeApp = {} as import("hono").Hono;
    const manifest = buildManifest(
      {
        pages: { "../routes/users/[id].tsx": makePageLoader("User") },
        layouts: {},
        contents: {},
        handlers: { "../routes/teams/settings.ts": fakeApp },
      },
      opts
    );

    expect(manifest.routes.map((route) => route.path)).toEqual(["/users/:id"]);
    expect(manifest.handlers.map((handler) => handler.path)).toEqual([
      "/teams/settings",
    ]);
  });

  it("throws when markdown content uses dynamic route syntax", () => {
    expect(() =>
      buildManifest(
        {
          pages: {},
          layouts: {},
          contents: { "../routes/blog/[slug].md": "---\ntitle: Blog\n---" },
          handlers: {},
        },
        opts
      )
    ).toThrow(RE_MARKDOWN_DYNAMIC_ROUTE);
  });

  it("collects handlers", () => {
    const fakeApp = {} as import("hono").Hono;
    const manifest = buildManifest(
      {
        pages: {},
        layouts: {},
        contents: {},
        handlers: { "../routes/healthz.ts": fakeApp },
      },
      opts
    );
    expect(manifest.handlers).toHaveLength(1);
    expect(manifest.handlers[0].path).toBe("/healthz");
  });

  describe("programmatic routes (opts.routes)", () => {
    it("adds programmatic routes to the route graph", () => {
      const load = makePageLoader("Book Detail");
      const manifest = buildManifest(
        { pages: {}, layouts: {}, contents: {}, handlers: {} },
        {
          ...opts,
          routes: [{ path: "/books/123", load }],
        }
      );
      expect(manifest.routes).toHaveLength(1);
      expect(manifest.routes[0].path).toBe("/books/123");
      expect(manifest.routes[0].load).toBe(load);
    });

    it("throws on duplicate between glob and programmatic route", () => {
      const load = makePageLoader("Dup");
      expect(() =>
        buildManifest(
          {
            pages: { "../routes/about.tsx": makePageLoader("About") },
            layouts: {},
            contents: {},
            handlers: {},
          },
          {
            ...opts,
            routes: [{ path: "/about", load }],
          }
        )
      ).toThrow(RE_DUPLICATE_ROUTE);
    });

    it("applies root layout chain to programmatic routes", () => {
      const load = makePageLoader("Book");
      const manifest = buildManifest(
        {
          pages: {},
          layouts: { "../routes/layout.tsx": layoutLoader },
          contents: {},
          handlers: {},
        },
        {
          ...opts,
          routes: [{ path: "/books/123", load }],
        }
      );
      expect(manifest.routes[0].layouts.map((l) => l.file)).toEqual([
        "../routes/layout.tsx",
      ]);
    });
  });
});
