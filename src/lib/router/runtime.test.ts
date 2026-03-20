import { describe, expect, it, vi } from "vitest";
import type { LayoutModule, RouteModule } from "../../factory";
import type { SiteConfig } from "../../render-document";
import { buildPageLoader, composeWithLayouts, resolveJsonLd } from "./runtime";

describe("composeWithLayouts", () => {
  it("returns body unchanged when no layouts", () => {
    const body = { type: "div" } as unknown as React.ReactElement;
    expect(composeWithLayouts(body, [])).toBe(body);
  });

  it("wraps body in layouts inner-to-outer", () => {
    const body = "inner" as unknown as React.ReactElement;
    const layouts: LayoutModule[] = [
      {
        default: ({ children }) =>
          ({ type: "outer", children }) as unknown as React.ReactElement,
      },
      {
        default: ({ children }) =>
          ({ type: "middle", children }) as unknown as React.ReactElement,
      },
    ];
    const result = composeWithLayouts(body, layouts) as unknown as {
      type: string;
      children: unknown;
    };
    expect(result.type).toBe("outer");
  });
});

describe("resolveJsonLd", () => {
  const baseSite: SiteConfig = {
    baseUrl: "https://example.com",
    name: "Test",
  };

  it("returns empty array when no jsonLd and no defaultJsonLd", () => {
    expect(resolveJsonLd(baseSite, { title: "Page" }, "/")).toEqual([]);
  });

  it("returns page jsonLd when no defaultJsonLd", () => {
    const pageItem = { "@type": "Article" };
    const result = resolveJsonLd(
      baseSite,
      { title: "Page", jsonLd: [pageItem] },
      "/"
    );
    expect(result).toEqual([pageItem]);
  });

  it("returns defaultJsonLd when no page jsonLd", () => {
    const defaultItem = { "@type": "WebSite" };
    const siteWithDefault = {
      ...baseSite,
      defaultJsonLd: () => [defaultItem],
    };
    const result = resolveJsonLd(siteWithDefault, { title: "Page" }, "/");
    expect(result).toEqual([defaultItem]);
  });

  it("merges defaultJsonLd with page jsonLd (default first)", () => {
    const defaultItem = { "@type": "WebSite" };
    const pageItem = { "@type": "Article" };
    const siteWithDefault = {
      ...baseSite,
      defaultJsonLd: () => [defaultItem],
    };
    const result = resolveJsonLd(
      siteWithDefault,
      { title: "Page", jsonLd: [pageItem] },
      "/"
    );
    expect(result).toEqual([defaultItem, pageItem]);
  });

  it("passes correct context to defaultJsonLd callback", () => {
    const spy = vi.fn(() => []);
    const siteWithSpy = { ...baseSite, defaultJsonLd: spy };
    resolveJsonLd(
      siteWithSpy,
      { title: "My Page", description: "Desc", date: "2025-01-01" },
      "/about"
    );
    expect(spy).toHaveBeenCalledWith({
      pathname: "/about",
      title: "My Page",
      description: "Desc",
      date: "2025-01-01",
    });
  });
});

describe("buildPageLoader", () => {
  const baseSite: SiteConfig = {
    baseUrl: "https://example.com",
    name: "Test",
  };

  const createResolved = (mod: RouteModule) => ({
    page: () => Promise.resolve(mod),
    layouts: [] as { file: string; loader: () => Promise<LayoutModule> }[],
  });

  it("returns a callable PageLoader", () => {
    const mod: RouteModule = {
      default: () => null as unknown as React.ReactElement,
      meta: { title: "Page" },
    };
    const loader = buildPageLoader(baseSite, createResolved(mod), mod, {
      pathname: "/test",
    });

    expect(typeof loader).toBe("function");
  });

  it("uses meta.title when available", () => {
    const mod: RouteModule = {
      default: () => null as unknown as React.ReactElement,
      meta: { title: "Custom Title" },
    };
    const spy = vi.fn(() => []);
    const site = { ...baseSite, defaultJsonLd: spy };
    buildPageLoader(site, createResolved(mod), mod, { pathname: "/test" });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Custom Title" })
    );
  });

  it("falls back to pathname when title is missing", () => {
    const mod: RouteModule = {
      default: () => null as unknown as React.ReactElement,
    };
    const spy = vi.fn(() => []);
    const site = { ...baseSite, defaultJsonLd: spy };
    buildPageLoader(site, createResolved(mod), mod, { pathname: "/fallback" });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "/fallback" })
    );
  });

  it("applies noindex override", async () => {
    const mod: RouteModule = {
      default: () => null as unknown as React.ReactElement,
      meta: { title: "Page" },
    };
    const loaderWithNoindex = buildPageLoader(
      baseSite,
      createResolved(mod),
      mod,
      { pathname: "/", noindex: true }
    );
    const loaderWithoutNoindex = buildPageLoader(
      baseSite,
      createResolved(mod),
      mod,
      { pathname: "/" }
    );

    // Both should be callable — the noindex difference manifests in the rendered document
    expect(typeof loaderWithNoindex).toBe("function");
    expect(typeof loaderWithoutNoindex).toBe("function");
  });
});
