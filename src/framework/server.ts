import { Hono } from "hono";
import { createMarkdownAdapter } from "./content/markdown";
import { markdownResponse } from "./content/response";
import { buildManifest, toMarkdownPath } from "./manifest";
import { renderRouteToRscStream } from "./render";
import type { AppEnv, RouteGlobs, RouteLoader, SiteConfig } from "./types";

const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";

export function acceptsRsc(request: Request): boolean {
  return request.headers.get("Accept")?.includes("text/x-component") ?? false;
}

type RenderRsc = Parameters<typeof renderRouteToRscStream>[1];

type RenderHtml = (
  rscStream: ReadableStream,
  options: { signal: AbortSignal }
) => Promise<ReadableStream>;

interface Renderer {
  renderHtml?: RenderHtml;
  renderRsc?: RenderRsc;
}

interface CreateAppOptions {
  globs: RouteGlobs;
  notFound?: RouteLoader;
  renderer?: Renderer;
  site: SiteConfig;
}

async function defaultRenderHtml(
  rscStream: ReadableStream,
  options: { signal: AbortSignal }
): Promise<ReadableStream> {
  // import.meta.viteRsc.import is statically transformed by @vitejs/plugin-rsc
  // and must be written in this exact form
  const ssrEntry = await import.meta.viteRsc.import<
    typeof import("./entry.ssr.tsx")
  >("./entry.ssr.tsx", { environment: "ssr" });
  return ssrEntry.renderHtml(rscStream, options);
}

async function negotiateResponse(
  request: Request,
  rscStream: ReadableStream,
  renderHtml: RenderHtml
): Promise<Response> {
  if (acceptsRsc(request)) {
    return new Response(rscStream, {
      headers: {
        "Content-Type": RSC_CONTENT_TYPE,
        Vary: "Accept",
      },
    });
  }
  const htmlStream = await renderHtml(rscStream, { signal: request.signal });
  return new Response(htmlStream, {
    headers: {
      "Content-Type": HTML_CONTENT_TYPE,
      Vary: "Accept",
    },
  });
}

export function createApp({
  site,
  globs,
  notFound,
  renderer = {},
}: CreateAppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const markdownAdapter = createMarkdownAdapter(
    site.renderMarkdown ??
      (async (body) => {
        const { createElement } = await import("react");
        return createElement("pre", null, body);
      })
  );

  const manifest = buildManifest(globs, {
    filterDrafts: import.meta.env.PROD,
    markdownAdapter,
  });

  const renderRsc = renderer.renderRsc;
  const renderHtml = renderer.renderHtml ?? defaultRenderHtml;

  // Global middleware
  app.use("*", async (c, next) => {
    c.set("markdownSources", manifest.markdownSources);
    c.set("routeManifest", manifest.entries);
    await next();
    if (c.res.headers.get("Content-Type")?.includes("text/html")) {
      c.res.headers.set("Speculation-Rules", '"/speculationrules.json"');
    }
  });

  app.onError((err, c) => {
    console.error(err);
    return c.text("Internal Server Error", 500);
  });

  // Page routes
  for (const route of manifest.routes) {
    app.get(route.path, async (c) => {
      const rscStream = await renderRouteToRscStream(
        { site, route, pathname: route.path },
        renderRsc
      );
      const response = await negotiateResponse(
        c.req.raw,
        rscStream,
        renderHtml
      );

      if (route.meta.cacheControl) {
        response.headers.set("Cache-Control", route.meta.cacheControl);
      }

      return response;
    });

    // .md auto-generation
    app.get(toMarkdownPath(route.path), async (_c) => {
      const getMarkdown = manifest.markdownSources.get(route.path);
      if (!getMarkdown) {
        return new Response("Not Found", { status: 404 });
      }
      return markdownResponse(await getMarkdown());
    });
  }

  // Handler routes
  for (const { path, app: handler } of manifest.handlers) {
    app.route(path, handler);
  }

  // Not found
  if (notFound) {
    app.get("*", async (c) => {
      const pathname = new URL(c.req.url).pathname;
      const mod = await notFound();
      const route = {
        meta: mod.meta ?? { title: pathname },
        load: notFound,
        layouts: [],
      };
      const rscStream = await renderRouteToRscStream(
        { site, route, pathname, noindex: true },
        renderRsc
      );
      const response = await negotiateResponse(
        c.req.raw,
        rscStream,
        renderHtml
      );

      return new Response(response.body, {
        status: 404,
        headers: response.headers,
      });
    });
  }

  return app;
}
