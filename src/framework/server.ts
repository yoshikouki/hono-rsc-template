import { Hono } from "hono";
import { createMarkdownAdapter } from "./content/markdown";
import { markdownResponse } from "./content/response";
import { buildManifest, resolveLayoutChain, toMarkdownPath } from "./manifest";
import { renderRouteToRscStream, resolveRouteMeta } from "./render";
import type {
  AppEnv,
  AppRoute,
  Route,
  RouteGlobs,
  RouteLoader,
  RouteManifestEntry,
  SiteConfig,
} from "./types";

const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const RSC_CACHE_CONTROL = "private, no-store";
const RSC_ROUTE_PREFIX = "/__rsc";

export function rscPathFor(path: string): string {
  return path === "/" ? RSC_ROUTE_PREFIX : `${RSC_ROUTE_PREFIX}${path}`;
}

export function pagePathFromRscPath(pathname: string): string | null {
  if (pathname === RSC_ROUTE_PREFIX || pathname === `${RSC_ROUTE_PREFIX}/`) {
    return "/";
  }

  if (!pathname.startsWith(`${RSC_ROUTE_PREFIX}/`)) {
    return null;
  }

  return pathname.slice(RSC_ROUTE_PREFIX.length);
}

type RenderRsc = Parameters<typeof renderRouteToRscStream>[1];

type RenderHtml = (
  rscStream: ReadableStream,
  options: { signal: AbortSignal }
) => Promise<ReadableStream>;

export interface Renderer {
  renderHtml?: RenderHtml;
  renderRsc?: RenderRsc;
}

interface CreateAppOptions<TContext = unknown> {
  createRequestContext?: (request: Request) => TContext | Promise<TContext>;
  globs: RouteGlobs<TContext>;
  notFound?: RouteLoader<TContext>;
  renderer?: Renderer;
  routes?: AppRoute<TContext>[];
  site: SiteConfig<TContext>;
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

async function renderHtmlResponse(
  request: Request,
  rscStream: ReadableStream,
  renderHtml: RenderHtml
): Promise<Response> {
  const htmlStream = await renderHtml(rscStream, { signal: request.signal });
  return new Response(htmlStream, {
    headers: {
      "Content-Type": HTML_CONTENT_TYPE,
    },
  });
}

function renderRscResponse(
  rscStream: ReadableStream,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", RSC_CONTENT_TYPE);
  headers.set("Cache-Control", RSC_CACHE_CONTROL);
  return new Response(rscStream, { ...init, headers });
}

export function includeRouteManifestEntry(
  entry: { draft?: boolean },
  env: Pick<ImportMetaEnv, "PROD"> = import.meta.env
): boolean {
  return !(entry.draft && env.PROD);
}

async function collectRouteManifest<TContext = unknown>(
  routes: Route<TContext>[],
  request: Request,
  context: TContext
): Promise<RouteManifestEntry[]> {
  const entries: RouteManifestEntry[] = [];

  for (const route of routes) {
    const pageModule = await route.load();
    if (pageModule.enumerate) {
      entries.push(
        ...(await pageModule.enumerate({ context, request })).filter((entry) =>
          includeRouteManifestEntry(entry)
        )
      );
      continue;
    }

    const meta = await resolveRouteMeta(pageModule, {
      context,
      params: {},
      pathname: route.path,
      request,
    });

    if (!includeRouteManifestEntry(meta)) {
      continue;
    }

    entries.push({
      path: route.path,
      title: meta.title || route.path,
      description: meta.description,
      date: meta.date,
    });
  }

  return entries;
}

export function createApp<TContext = unknown>({
  site,
  globs,
  notFound,
  renderer = {},
  routes: appRoutes,
  createRequestContext,
}: CreateAppOptions<TContext>): Hono<AppEnv> {
  const app = new Hono<AppEnv>({ strict: false });

  const markdownAdapter = createMarkdownAdapter(
    site.renderMarkdown ??
      (async (body) => {
        const { createElement } = await import("react");
        return createElement("pre", null, body);
      })
  );

  const manifest = buildManifest<TContext>(globs, {
    filterDrafts: import.meta.env.PROD,
    markdownAdapter,
    routes: appRoutes,
  });

  const renderRsc = renderer.renderRsc;
  const renderHtml = renderer.renderHtml ?? defaultRenderHtml;

  // Global middleware
  app.use("*", async (c, next) => {
    c.set("site", site as SiteConfig);
    c.set("markdownSources", manifest.markdownSources);
    c.set("routeManifest", async () => {
      const context = createRequestContext
        ? await createRequestContext(c.req.raw)
        : (undefined as TContext);
      return collectRouteManifest(manifest.routes, c.req.raw, context);
    });
    await next();
    if (
      site.speculationRulesPath &&
      c.res.headers.get("Content-Type")?.includes("text/html")
    ) {
      c.res.headers.set("Speculation-Rules", `"${site.speculationRulesPath}"`);
    }
  });

  app.onError((err, c) => {
    console.error(err);
    return c.text("Internal Server Error", 500);
  });

  // Page routes
  for (const route of manifest.routes) {
    app.get(route.path, async (c) => {
      const context = createRequestContext
        ? await createRequestContext(c.req.raw)
        : (undefined as TContext);
      const rscStream = await renderRouteToRscStream(
        { site, route, pathname: route.path, request: c.req.raw, context },
        renderRsc
      );
      const response = await renderHtmlResponse(
        c.req.raw,
        rscStream.stream,
        renderHtml
      );

      if (rscStream.meta.cacheControl) {
        response.headers.set("Cache-Control", rscStream.meta.cacheControl);
      }

      return response;
    });

    app.get(rscPathFor(route.path), async (c) => {
      const context = createRequestContext
        ? await createRequestContext(c.req.raw)
        : (undefined as TContext);
      const rscStream = await renderRouteToRscStream(
        { site, route, pathname: route.path, request: c.req.raw, context },
        renderRsc
      );
      return renderRscResponse(rscStream.stream);
    });

    // .md auto-generation
    app.get(toMarkdownPath(route.path), async (c) => {
      const getMarkdown = manifest.markdownSources.get(route.path);
      if (!getMarkdown) {
        const context = createRequestContext
          ? await createRequestContext(c.req.raw)
          : (undefined as TContext);
        const pageModule = await route.load();
        const meta = await resolveRouteMeta(pageModule, {
          context,
          params: {},
          pathname: route.path,
          request: c.req.raw,
        });
        const markdown = await meta.markdown?.();
        if (!markdown) {
          return new Response("Not Found", { status: 404 });
        }
        return markdownResponse(markdown);
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
      const requestPathname = new URL(c.req.url).pathname;
      const rscPagePath = pagePathFromRscPath(requestPathname);
      const pathname = rscPagePath ?? requestPathname;
      const context = createRequestContext
        ? await createRequestContext(c.req.raw)
        : (undefined as TContext);
      const route = {
        load: notFound,
        layouts: resolveLayoutChain("/", globs.layouts),
      };
      const rscStream = await renderRouteToRscStream(
        { site, route, pathname, request: c.req.raw, noindex: true, context },
        renderRsc
      );

      if (rscPagePath) {
        return renderRscResponse(rscStream.stream, { status: 404 });
      }

      const response = await renderHtmlResponse(
        c.req.raw,
        rscStream.stream,
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
