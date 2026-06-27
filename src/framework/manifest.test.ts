import { describe, expect, it } from "vitest";
import {
  generatedRoutePathsForRoute,
  resolveLayoutChain,
  routeFileToManifestPath,
  routePathsOverlap,
  routePathToShape,
  sortRoutesBySpecificity,
  toMarkdownPath,
} from "./manifest";
import type { LayoutLoader } from "./types";

const RE_UNSUPPORTED_DYNAMIC_ROUTE = /Unsupported dynamic route segment/;

const layoutLoader: LayoutLoader = async () => ({
  default: ({ children }) => children as React.ReactElement,
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
    const chain = resolveLayoutChain("about/career", {
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
    const chain = resolveLayoutChain("about", {
      "../routes/layout.tsx": layoutLoader,
      "../routes/about/layout.tsx": layoutLoader,
    });
    expect(chain.map((l) => l.file)).toEqual([
      "../routes/layout.tsx",
      "../routes/about/layout.tsx",
    ]);
  });

  it("returns root layout for top-level route", () => {
    const chain = resolveLayoutChain("", {
      "../routes/layout.tsx": layoutLoader,
    });
    expect(chain.map((l) => l.file)).toEqual(["../routes/layout.tsx"]);
  });

  it("supports ./routes/ prefix as well", () => {
    const chain = resolveLayoutChain("", {
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

  it("supports catch-all dynamic segments from hono-file-router", () => {
    expect(
      routeFileToManifestPath("../routes/blog/[...slug]/index.tsx", ".tsx")
    ).toEqual({
      path: "/blog/:slug{.+}",
      routeDirectory: "blog/[...slug]",
    });
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

describe("generatedRoutePathsForRoute", () => {
  it("generates RSC and markdown routes for static routes", () => {
    expect(generatedRoutePathsForRoute("/about")).toEqual([
      "/__rsc/about",
      "/about.md",
    ]);
  });

  it("does not generate markdown routes for dynamic routes", () => {
    expect(generatedRoutePathsForRoute("/users/:id")).toEqual([
      "/__rsc/users/:id",
    ]);
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
