import type { Hono as HonoBase, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "../../factory";
import { renderDocument } from "../../render-document";
import type { SiteConfig } from "../../render-document";
import { markdownResponse } from "../markdown/response";
import type { ResolvedRoute } from "./resolver";
import { handlerFileToPath, toMarkdownPath } from "./resolver";

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
    const pageLoader = () =>
      Promise.resolve({
        default: async () => {
          const layoutModules = await Promise.all(
            resolved.layouts.map(({ loader }) => loader())
          );
          let body = await pageModule.default();

          for (let i = layoutModules.length - 1; i >= 0; i -= 1) {
            body = layoutModules[i].default({ children: body });
          }

          return renderDocument(site, {
            title: pageModule.meta?.title ?? routePath,
            description: pageModule.meta?.description,
            pathname: pageModule.meta?.pathname ?? routePath,
            jsonLd: pageModule.meta?.jsonLd,
            ogImage: pageModule.meta?.ogImage,
            body,
          });
        },
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
    registerPageHandler(app, pathPrefix + path, resolved, middleware, site, path);
  }

  if (!pathPrefix) {
    // .md auto-generation handlers (SSR only)
    for (const [path, resolved] of routeMap) {
      app.get(toMarkdownPath(path), async () => {
        const mod = await resolved.page();
        if (!mod.meta?.markdown) {
          return new Response("Not Found", { status: 404 });
        }
        return markdownResponse(await mod.meta.markdown());
      });
    }
  }

  return app;
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
