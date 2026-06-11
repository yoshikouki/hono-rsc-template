import { describe, expect, it } from "vitest";
import type { MarkdownAdapter } from "./content/markdown";
import { buildManifest, resolveLayoutChain, toMarkdownPath } from "./manifest";
import type { LayoutLoader, RouteMeta, RouteModule } from "./types";

const RE_STUB_TITLE = /^---\ntitle: ([^\n]*)\n/;
const RE_STUB_DRAFT = /draft: true/;
const RE_STUB_DATE_TITLE = /^---\ntitle: ([^\n]*)\ndate: ([^\n]*)\n/;
const RE_DUPLICATE_ROUTE = /Duplicate route/;
const RE_DUPLICATE_HANDLER = /Duplicate handler route/;

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
      meta,
    }),
  };
};

const layoutLoader: LayoutLoader = async () => ({
  default: ({ children }) => children as React.ReactElement,
});

const makePageLoader = (title: string) => async (): Promise<RouteModule> => ({
  default: () => null as unknown as React.ReactElement,
  meta: { title },
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

describe("buildManifest", () => {
  const opts = { markdownAdapter: stubAdapter };

  it("builds routes from tsx pages", () => {
    const manifest = buildManifest(
      {
        pages: { "../routes/about.tsx": makePageLoader("About") },
        metas: { "../routes/about.tsx": { title: "About" } },
        layouts: {},
        contents: {},
        handlers: {},
      },
      opts
    );
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].path).toBe("/about");
    expect(manifest.routes[0].meta.title).toBe("About");
  });

  it("falls back to path when meta is absent", () => {
    const manifest = buildManifest(
      {
        pages: { "../routes/about.tsx": makePageLoader("About") },
        metas: {},
        layouts: {},
        contents: {},
        handlers: {},
      },
      opts
    );
    expect(manifest.routes[0].meta.title).toBe("/about");
  });

  it("throws on duplicate tsx routes", () => {
    expect(() =>
      buildManifest(
        {
          pages: {
            "../routes/about.tsx": makePageLoader("A"),
            "../routes/about/index.tsx": makePageLoader("B"),
          },
          metas: {},
          layouts: {},
          contents: {},
          handlers: {},
        },
        opts
      )
    ).toThrow(RE_DUPLICATE_ROUTE);
  });

  it("builds routes from md contents", () => {
    const manifest = buildManifest(
      {
        pages: {},
        metas: {},
        layouts: {},
        contents: { "../routes/hello.md": "---\ntitle: Hello\n---\nBody" },
        handlers: {},
      },
      opts
    );
    expect(manifest.routes[0].path).toBe("/hello");
    expect(manifest.routes[0].meta.title).toBe("Hello");
  });

  it("populates markdownSources for md contents", async () => {
    const raw = "---\ntitle: Hello\n---\nBody";
    const manifest = buildManifest(
      {
        pages: {},
        metas: {},
        layouts: {},
        contents: { "../routes/hello.md": raw },
        handlers: {},
      },
      opts
    );
    expect(manifest.markdownSources.has("/hello")).toBe(true);
    expect(await manifest.markdownSources.get("/hello")?.()).toBe(raw);
  });

  it("populates markdownSources for tsx pages with markdown meta", async () => {
    const loader = async (): Promise<RouteModule> => ({
      default: () => null as unknown as React.ReactElement,
      meta: { title: "Page", markdown: () => "# Hello" },
    });
    const manifest = buildManifest(
      {
        pages: { "../routes/page.tsx": loader },
        metas: {
          "../routes/page.tsx": { title: "Page", markdown: () => "# Hello" },
        },
        layouts: {},
        contents: {},
        handlers: {},
      },
      opts
    );
    expect(manifest.markdownSources.has("/page")).toBe(true);
    expect(await manifest.markdownSources.get("/page")?.()).toBe("# Hello");
  });

  it("excludes draft content when filterDrafts is true", () => {
    const manifest = buildManifest(
      {
        pages: {},
        metas: {},
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
        metas: {},
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
        metas: { "../routes/hello.tsx": { title: "TSX Hello" } },
        layouts: {},
        contents: { "../routes/hello.md": "---\ntitle: MD Hello\n---\nBody" },
        handlers: {},
      },
      opts
    );
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].meta.title).toBe("TSX Hello");
  });

  it("stores resolved layout chain with routes", () => {
    const manifest = buildManifest(
      {
        pages: { "../routes/about/career.tsx": makePageLoader("Career") },
        metas: { "../routes/about/career.tsx": { title: "Career" } },
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

  it("records date in entries", () => {
    const manifest = buildManifest(
      {
        pages: {},
        metas: {},
        layouts: {},
        contents: {
          "../routes/post.md": "---\ntitle: Post\ndate: 2025-03-20\n---\nBody",
        },
        handlers: {},
      },
      {
        markdownAdapter: (raw, path) => {
          const fm = raw.match(RE_STUB_DATE_TITLE);
          const title = fm?.[1]?.trim() || path;
          const date = fm?.[2]?.trim();
          const meta: RouteMeta = { title, date, markdown: () => raw };
          return {
            meta,
            load: async () => ({
              default: () => null as unknown as React.ReactElement,
              meta,
            }),
          };
        },
      }
    );
    expect(manifest.entries[0].date).toBe("2025-03-20");
  });

  it("throws on duplicate handler routes", () => {
    const fakeApp = {} as import("hono").Hono;
    expect(() =>
      buildManifest(
        {
          pages: {},
          metas: {},
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

  it("collects handlers", () => {
    const fakeApp = {} as import("hono").Hono;
    const manifest = buildManifest(
      {
        pages: {},
        metas: {},
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
    it("adds programmatic routes to entries and routes", () => {
      const load = makePageLoader("Book Detail");
      const manifest = buildManifest(
        { pages: {}, metas: {}, layouts: {}, contents: {}, handlers: {} },
        {
          ...opts,
          routes: [{ path: "/books/123", meta: { title: "Book 123" }, load }],
        }
      );
      expect(manifest.routes).toHaveLength(1);
      expect(manifest.routes[0].path).toBe("/books/123");
      expect(manifest.routes[0].meta.title).toBe("Book 123");
      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0].path).toBe("/books/123");
    });

    it("throws on duplicate between glob and programmatic route", () => {
      const load = makePageLoader("Dup");
      expect(() =>
        buildManifest(
          {
            pages: { "../routes/about.tsx": makePageLoader("About") },
            metas: {},
            layouts: {},
            contents: {},
            handlers: {},
          },
          {
            ...opts,
            routes: [{ path: "/about", meta: { title: "About dup" }, load }],
          }
        )
      ).toThrow(RE_DUPLICATE_ROUTE);
    });

    it("applies root layout chain to programmatic routes", () => {
      const load = makePageLoader("Book");
      const manifest = buildManifest(
        {
          pages: {},
          metas: {},
          layouts: { "../routes/layout.tsx": layoutLoader },
          contents: {},
          handlers: {},
        },
        {
          ...opts,
          routes: [{ path: "/books/123", meta: { title: "Book 123" }, load }],
        }
      );
      expect(manifest.routes[0].layouts.map((l) => l.file)).toEqual([
        "../routes/layout.tsx",
      ]);
    });

    it("registers markdownSources for programmatic route with markdown meta", async () => {
      const load = makePageLoader("Page");
      const manifest = buildManifest(
        { pages: {}, metas: {}, layouts: {}, contents: {}, handlers: {} },
        {
          ...opts,
          routes: [
            {
              path: "/books/123",
              meta: { title: "Book 123", markdown: () => "# Hello" },
              load,
            },
          ],
        }
      );
      expect(manifest.markdownSources.has("/books/123")).toBe(true);
      expect(await manifest.markdownSources.get("/books/123")?.()).toBe(
        "# Hello"
      );
    });
  });
});
