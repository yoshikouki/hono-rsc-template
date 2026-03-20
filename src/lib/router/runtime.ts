import type { Hono as HonoBase, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppEnv, LayoutModule, PageLoader, RouteModule } from "../../factory";
import type { SiteConfig } from "../../render-document";
import { renderDocument } from "../../render-document";
import { markdownResponse } from "../markdown/response";
import type { ResolvedRoute } from "./resolver";
import { handlerFileToPath, toMarkdownPath } from "./resolver";

export function composeWithLayouts(
  body: React.ReactElement,
  layoutModules: LayoutModule[]
): React.ReactElement {
  let composed = body;
  for (let i = layoutModules.length - 1; i >= 0; i -= 1) {
    composed = layoutModules[i].default({ children: composed });
  }
  return composed;
}

export function resolveJsonLd(
  site: SiteConfig,
  meta: {
    title: string;
    description?: string;
    date?: string;
    jsonLd?: unknown[];
  },
  pathname: string
): unknown[] {
  const context = {
    pathname,
    title: meta.title,
    description: meta.description,
    date: meta.date,
  };
  const defaultLd = site.defaultJsonLd?.(context) ?? [];
  return [...defaultLd, ...(meta.jsonLd ?? [])];
}

export function buildPageLoader(
  site: SiteConfig,
  resolved: ResolvedRoute,
  pageModule: RouteModule,
  options: { pathname: string; noindex?: boolean }
): PageLoader {
  const title = pageModule.meta?.title ?? options.pathname;
  const jsonLd = resolveJsonLd(
    site,
    {
      title,
      description: pageModule.meta?.description,
      date: pageModule.meta?.date,
      jsonLd: pageModule.meta?.jsonLd,
    },
    options.pathname
  );

  return () =>
    Promise.resolve({
      default: async () => {
        const layoutModules = await Promise.all(
          resolved.layouts.map(({ loader }) => loader())
        );
        const body = composeWithLayouts(
          await pageModule.default(),
          layoutModules
        );

        return renderDocument(site, {
          title,
          description: pageModule.meta?.description,
          pathname: pageModule.meta?.pathname ?? options.pathname,
          jsonLd,
          noindex: options.noindex ?? pageModule.meta?.noindex,
          ogImage: pageModule.meta?.ogImage,
          body,
        });
      },
    });
}

function registerPageHandler(
  app: Hono<AppEnv>,
  path: string,
  resolved: ResolvedRoute,
  middleware: MiddlewareHandler<AppEnv>,
  site: SiteConfig,
  routePath = path
) {
  app.get(path, middleware, async (c) => {
    const pageModule = await resolved.page();
    const pageLoader = buildPageLoader(site, resolved, pageModule, {
      pathname: routePath,
    });

    const response = await c.var.renderPage(c.req.raw, pageLoader);

    if (pageModule.meta?.cacheControl) {
      response.headers.set("Cache-Control", pageModule.meta.cacheControl);
    }

    return response;
  });
}

export function createPageRouter(
  middleware: MiddlewareHandler<AppEnv>,
  routeMap: Map<string, ResolvedRoute>,
  site: SiteConfig,
  pathPrefix = ""
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  for (const [path, resolved] of routeMap) {
    registerPageHandler(
      app,
      pathPrefix + path,
      resolved,
      middleware,
      site,
      path
    );
  }

  if (!pathPrefix) {
    // .md auto-generation handlers (SSR only)
    for (const [path] of routeMap) {
      app.get(toMarkdownPath(path), async (c) => {
        const getMarkdown = c.var.markdownSources.get(path);
        if (!getMarkdown) {
          return new Response("Not Found", { status: 404 });
        }
        return markdownResponse(await getMarkdown());
      });
    }
  }

  return app;
}

export function registerNotFoundHandler(
  app: Hono<AppEnv>,
  middleware: MiddlewareHandler<AppEnv>,
  resolved: ResolvedRoute,
  site: SiteConfig
) {
  app.get("*", middleware, async (c) => {
    const pageModule = await resolved.page();
    const pageLoader = buildPageLoader(site, resolved, pageModule, {
      pathname: new URL(c.req.url).pathname,
      noindex: true,
    });

    const response = await c.var.renderPage(c.req.raw, pageLoader);
    return new Response(response.body, {
      status: 404,
      headers: response.headers,
    });
  });
}

export function createHandlerRouter(
  handlers: Record<string, HonoBase>
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const seen = new Map<string, string>();

  for (const [file, handler] of Object.entries(handlers)) {
    const path = handlerFileToPath(file);
    if (seen.has(path)) {
      throw new Error(
        `Duplicate handler route "${path}": ${seen.get(path)} and ${file}`
      );
    }

    seen.set(path, file);
    app.route(path, handler);
  }

  return app;
}
