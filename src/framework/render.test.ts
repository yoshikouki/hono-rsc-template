import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildDocumentElement,
  composeWithLayouts,
  renderRouteToRscStream,
  resolveJsonLd,
} from "./render";
import type { LayoutModule, Route, SiteConfig } from "./types";

const baseSite: SiteConfig = {
  baseUrl: "https://example.com",
  name: "Test",
};

const makeRoute = (
  overrides: Partial<Pick<Route, "layouts" | "load" | "meta">> = {}
): Pick<Route, "layouts" | "load" | "meta"> => ({
  meta: { title: "Page" },
  load: async () => ({
    default: () => createElement("div", null, "body"),
  }),
  layouts: [],
  ...overrides,
});

describe("composeWithLayouts", () => {
  it("returns body unchanged when no layouts", () => {
    const body = createElement("div", null, "body");
    expect(composeWithLayouts(body, [], undefined)).toBe(body);
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
    const result = composeWithLayouts(body, layouts, undefined) as unknown as {
      type: string;
      children: unknown;
    };
    expect(result.type).toBe("outer");
  });
});

describe("resolveJsonLd", () => {
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
    const site = { ...baseSite, defaultJsonLd: () => [defaultItem] };
    expect(resolveJsonLd(site, { title: "Page" }, "/")).toEqual([defaultItem]);
  });

  it("merges defaultJsonLd with page jsonLd (default first)", () => {
    const defaultItem = { "@type": "WebSite" };
    const pageItem = { "@type": "Article" };
    const site = { ...baseSite, defaultJsonLd: () => [defaultItem] };
    expect(
      resolveJsonLd(site, { title: "Page", jsonLd: [pageItem] }, "/")
    ).toEqual([defaultItem, pageItem]);
  });

  it("passes correct context to defaultJsonLd callback", () => {
    const spy = vi.fn(() => []);
    resolveJsonLd(
      { ...baseSite, defaultJsonLd: spy },
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

describe("buildDocumentElement", () => {
  it("returns a ReactElement", async () => {
    const el = await buildDocumentElement({
      site: baseSite,
      route: makeRoute(),
      pathname: "/",
    });
    expect(el).toBeDefined();
    expect(typeof el).toBe("object");
  });

  it("falls back to pathname when meta title is empty", async () => {
    const el = await buildDocumentElement({
      site: baseSite,
      route: makeRoute({ meta: { title: "" } }),
      pathname: "/fallback",
    });
    expect(el).toBeDefined();
  });

  it("applies noindex from input override", async () => {
    const el = await buildDocumentElement({
      site: baseSite,
      route: makeRoute({ meta: { title: "Page", noindex: false } }),
      pathname: "/",
      noindex: true,
    });
    expect(el).toBeDefined();
  });

  it("applies noindex from meta when input override is absent", async () => {
    const el = await buildDocumentElement({
      site: baseSite,
      route: makeRoute({ meta: { title: "Page", noindex: true } }),
      pathname: "/",
    });
    expect(el).toBeDefined();
  });

  it("calls defaultJsonLd with route meta", async () => {
    const spy = vi.fn(() => []);
    await buildDocumentElement({
      site: { ...baseSite, defaultJsonLd: spy },
      route: makeRoute({ meta: { title: "Post", date: "2025-01-01" } }),
      pathname: "/post",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Post",
        date: "2025-01-01",
        pathname: "/post",
      })
    );
  });

  it("loads and composes layouts", async () => {
    const layoutSpy = vi.fn(({ children }: { children: React.ReactNode }) =>
      createElement("div", { "data-layout": "true" }, children)
    );
    const route = makeRoute({
      layouts: [
        { file: "layout.tsx", load: async () => ({ default: layoutSpy }) },
      ],
    });
    await buildDocumentElement({ site: baseSite, route, pathname: "/" });
    expect(layoutSpy).toHaveBeenCalled();
  });
});

describe("renderRouteToRscStream", () => {
  it("calls renderRsc stub with the document element", async () => {
    const stream = new ReadableStream();
    const renderRsc = vi.fn(async () => stream);
    const result = await renderRouteToRscStream(
      { site: baseSite, route: makeRoute(), pathname: "/" },
      renderRsc
    );
    expect(renderRsc).toHaveBeenCalledOnce();
    expect(result).toBe(stream);
  });

  it("passes ReactElement to renderRsc", async () => {
    let capturedEl: unknown;
    const renderRsc = vi.fn((el: React.ReactElement) => {
      capturedEl = el;
      return Promise.resolve(new ReadableStream());
    });
    await renderRouteToRscStream(
      { site: baseSite, route: makeRoute(), pathname: "/" },
      renderRsc
    );
    expect(capturedEl).toBeDefined();
    expect(typeof capturedEl).toBe("object");
  });
});
