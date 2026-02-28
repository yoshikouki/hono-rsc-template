import { describe, expect, it } from "vitest";
import type { LayoutModule, RouteModule } from "../../factory";
import { buildRouteMap, resolveLayoutChain } from "./resolver";

const createPageLoader = (title: string) => async (): Promise<RouteModule> => ({
  default: () => null as unknown as React.ReactElement,
  meta: { title },
});

const layoutLoader = async (): Promise<LayoutModule> => ({
  default: ({ children }) => children as React.ReactElement,
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
        "../routes/about/career.tsx": createPageLoader("Career"),
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
        "../routes/index.tsx": createPageLoader("Home"),
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
});
