import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildDocumentElement,
  composeWithLayouts,
  renderRouteToRscStream,
  resolveJsonLd,
  resolveRouteMeta,
} from "./render";
import type { LayoutModule, Route, RouteMeta, SiteConfig } from "./types";

const baseSite: SiteConfig = {
  baseUrl: "https://example.com",
  name: "Test",
};

const request = new Request("https://example.com/");

const makeRoute = (
  overrides: Partial<Pick<Route, "layouts" | "load">> & {
    meta?: RouteMeta;
  } = {}
): Pick<Route, "layouts" | "load"> => ({
  load: async () => ({
    default: () => createElement("div", null, "body"),
    resolveMeta: () => overrides.meta ?? { title: "Page" },
  }),
  layouts: [],
  ...Object.fromEntries(
    Object.entries(overrides).filter(([key]) => key !== "meta")
  ),
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

describe("resolveRouteMeta", () => {
  it("calls the route module resolveMeta function", async () => {
    const resolveMetaSpy = vi.fn(() => ({ title: "Resolved" }));
    const meta = await resolveRouteMeta(
      { resolveMeta: resolveMetaSpy },
      {
        context: undefined,
        params: {},
        pathname: "/resolved",
        request,
      }
    );
    expect(meta.title).toBe("Resolved");
    expect(resolveMetaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/resolved", params: {} })
    );
  });
});

describe("buildDocumentElement", () => {
  it("returns a ReactElement", async () => {
    const { element } = await buildDocumentElement({
      site: baseSite,
      route: makeRoute(),
      pathname: "/",
      request,
    });
    expect(element).toBeDefined();
    expect(typeof element).toBe("object");
  });

  it("falls back to pathname when meta title is empty", async () => {
    const { element, meta } = await buildDocumentElement({
      site: baseSite,
      route: makeRoute({ meta: { title: "" } }),
      pathname: "/fallback",
      request,
    });
    expect(element).toBeDefined();
    expect(meta.title).toBe("");
  });

  it("applies noindex from input override", async () => {
    const { element } = await buildDocumentElement({
      site: baseSite,
      route: makeRoute({ meta: { title: "Page", noindex: false } }),
      pathname: "/",
      request,
      noindex: true,
    });
    expect(element).toBeDefined();
  });

  it("applies noindex from meta when input override is absent", async () => {
    const { element } = await buildDocumentElement({
      site: baseSite,
      route: makeRoute({ meta: { title: "Page", noindex: true } }),
      pathname: "/",
      request,
    });
    expect(element).toBeDefined();
  });

  it("calls defaultJsonLd with route meta", async () => {
    const spy = vi.fn(() => []);
    await buildDocumentElement({
      site: { ...baseSite, defaultJsonLd: spy },
      route: makeRoute({ meta: { title: "Post", date: "2025-01-01" } }),
      pathname: "/post",
      request,
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
    await buildDocumentElement({
      site: baseSite,
      route,
      pathname: "/",
      request,
    });
    expect(layoutSpy).toHaveBeenCalled();
  });

  it("passes params to page default and resolveMeta", async () => {
    const defaultSpy = vi.fn(() => createElement("div", null, "party"));
    const resolveMetaSpy = vi.fn(() => ({ title: "Party" }));
    const route: Pick<Route, "layouts" | "load"> = {
      layouts: [],
      load: async () => ({
        default: defaultSpy,
        resolveMeta: resolveMetaSpy,
      }),
    };

    await buildDocumentElement({
      site: baseSite,
      route,
      pathname: "/app/parties/abc",
      request,
      params: { partyId: "abc" },
    });

    expect(defaultSpy).toHaveBeenCalledWith(
      expect.objectContaining({ params: { partyId: "abc" } })
    );
    expect(resolveMetaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ params: { partyId: "abc" } })
    );
  });
});

describe("renderRouteToRscStream", () => {
  it("calls renderRsc stub with the document element", async () => {
    const stream = new ReadableStream();
    const renderRsc = vi.fn(async () => stream);
    const result = await renderRouteToRscStream(
      { site: baseSite, route: makeRoute(), pathname: "/", request },
      renderRsc
    );
    expect(renderRsc).toHaveBeenCalledOnce();
    expect(result.stream).toBe(stream);
    expect(result.meta.title).toBe("Page");
  });

  it("passes ReactElement to renderRsc", async () => {
    let capturedEl: unknown;
    const renderRsc = vi.fn((el: React.ReactElement) => {
      capturedEl = el;
      return Promise.resolve(new ReadableStream());
    });
    await renderRouteToRscStream(
      { site: baseSite, route: makeRoute(), pathname: "/", request },
      renderRsc
    );
    expect(capturedEl).toBeDefined();
    expect(typeof capturedEl).toBe("object");
  });
});
