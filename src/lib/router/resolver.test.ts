import { describe, expect, it } from "vitest";
import type { LayoutModule, RouteModule } from "../../factory";
import {
  buildRouteMap,
  createMarkdownRouteModule,
  resolveLayoutChain,
} from "./resolver";

const createPageModule = (title: string): RouteModule => ({
  default: () => null as unknown as React.ReactElement,
  meta: { title },
});

const layoutLoader = async (): Promise<LayoutModule> => ({
  default: ({ children }) => children as React.ReactElement,
});

describe("createMarkdownRouteModule", () => {
  it("creates a module with correct meta from frontmatter", () => {
    const frontmatter = {
      title: "Post",
      description: "Desc",
      date: "2025-01-01",
      body: "content",
    };
    const mod = createMarkdownRouteModule(
      "---\ntitle: Post\n---\ncontent",
      "/post",
      frontmatter
    );

    expect(mod.meta?.title).toBe("Post");
    expect(mod.meta?.description).toBe("Desc");
    expect(mod.meta?.date).toBe("2025-01-01");
    expect(mod.meta?.pathname).toBe("/post");
  });

  it("provides markdown accessor that returns raw content", async () => {
    const raw = "---\ntitle: Post\n---\ncontent";
    const frontmatter = { title: "Post", body: "content" };
    const mod = createMarkdownRouteModule(raw, "/post", frontmatter);

    expect(await mod.meta?.markdown?.()).toBe(raw);
  });

  it("falls back to path when title is empty", () => {
    const frontmatter = { title: "", body: "content" };
    const mod = createMarkdownRouteModule("content", "/untitled", frontmatter);

    expect(mod.meta?.title).toBe("/untitled");
  });

  it("renders markdown body as article element", async () => {
    const raw = "---\ntitle: Test\n---\n# Hello";
    const frontmatter = { title: "Test", body: "# Hello" };
    const mod = createMarkdownRouteModule(raw, "/test", frontmatter);

    const element = await mod.default();
    expect(element).toBeDefined();
  });
});

describe("resolveLayoutChain", () => {
  it("returns outer-to-inner layouts for nested routes", () => {
    const chain = resolveLayoutChain("/about/career", {
      "../routes/layout.tsx": layoutLoader,
      "../routes/about/layout.tsx": layoutLoader,
      "../routes/about/career/layout.tsx": layoutLoader,
    });

    expect(chain.map((layout) => layout.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/about/layout.tsx",
      "../routes/about/career/layout.tsx",
    ]);
  });

  it("returns root layout for top-level route", () => {
    const chain = resolveLayoutChain("/", {
      "../routes/layout.tsx": layoutLoader,
    });

    expect(chain.map((layout) => layout.file)).toEqual([
      "../routes/layout.tsx",
    ]);
  });
});

describe("buildRouteMap", () => {
  it("stores resolved layout chain with each page route", () => {
    const { routeMap } = buildRouteMap({
      pages: {
        "../routes/about/career.tsx": createPageModule("Career"),
      },
      layouts: {
        "../routes/layout.tsx": layoutLoader,
        "../routes/about/layout.tsx": layoutLoader,
      },
      contents: {},
    });

    const resolved = routeMap.get("/about/career");

    expect(resolved?.layouts.map((layout) => layout.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/about/layout.tsx",
    ]);
  });

  it("maps index.tsx to /", () => {
    const { routeMap } = buildRouteMap({
      pages: {
        "../routes/index.tsx": createPageModule("Home"),
      },
      layouts: {},
      contents: {},
    });

    expect(routeMap.has("/")).toBe(true);
  });

  it("maps markdown content files to routes", () => {
    const { routeMap } = buildRouteMap({
      pages: {},
      layouts: {},
      contents: {
        "../routes/hello.md": "---\ntitle: Hello\n---\nBody",
      },
    });

    expect(routeMap.has("/hello")).toBe(true);
  });

  it("records date from page meta in manifest", () => {
    const pageWithDate: RouteModule = {
      default: () => null as unknown as React.ReactElement,
      meta: { title: "Blog Post", date: "2025-06-15" },
    };
    const { manifest } = buildRouteMap({
      pages: { "../routes/blog/post.tsx": pageWithDate },
      layouts: {},
      contents: {},
    });

    expect(manifest[0].date).toBe("2025-06-15");
  });

  it("falls back to path when title is empty string", () => {
    const pageEmptyTitle: RouteModule = {
      default: () => null as unknown as React.ReactElement,
      meta: { title: "" },
    };
    const { manifest } = buildRouteMap({
      pages: { "../routes/about.tsx": pageEmptyTitle },
      layouts: {},
      contents: {},
    });

    expect(manifest[0].title).toBe("/about");
  });

  it("populates markdownSources for markdown content files", () => {
    const { markdownSources } = buildRouteMap({
      pages: {},
      layouts: {},
      contents: {
        "../routes/hello.md": "---\ntitle: Hello\n---\nBody content",
      },
    });

    expect(markdownSources.has("/hello")).toBe(true);
  });

  it("returns raw content from markdownSources", async () => {
    const raw = "---\ntitle: Hello\n---\nBody content";
    const { markdownSources } = buildRouteMap({
      pages: {},
      layouts: {},
      contents: { "../routes/hello.md": raw },
    });

    const getMarkdown = markdownSources.get("/hello");
    expect(await getMarkdown?.()).toBe(raw);
  });

  it("populates markdownSources for pages with markdown meta", async () => {
    const pageWithMarkdown: RouteModule = {
      default: () => null as unknown as React.ReactElement,
      meta: { title: "Page", markdown: () => "# Hello" },
    };
    const { markdownSources } = buildRouteMap({
      pages: { "../routes/page.tsx": pageWithMarkdown },
      layouts: {},
      contents: {},
    });

    expect(markdownSources.has("/page")).toBe(true);
    const getMarkdown = markdownSources.get("/page");
    expect(await getMarkdown?.()).toBe("# Hello");
  });

  it("includes draft content in development mode", () => {
    const { routeMap } = buildRouteMap({
      pages: {},
      layouts: {},
      contents: {
        "../routes/draft.md": "---\ntitle: Draft\ndraft: true\n---\nBody",
      },
    });

    // In test environment, import.meta.env.PROD is false, so drafts are included
    expect(routeMap.has("/draft")).toBe(true);
  });

  it("records date from markdown frontmatter in manifest", () => {
    const { manifest } = buildRouteMap({
      pages: {},
      layouts: {},
      contents: {
        "../routes/post.md": "---\ntitle: Post\ndate: 2025-03-20\n---\nBody",
      },
    });

    expect(manifest[0].date).toBe("2025-03-20");
  });
});
