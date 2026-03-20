import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppEnv, RouteLoader } from "./factory";
import {
  buildRouteMap,
  type RouteGlobs,
  resolveLayoutChain,
} from "./lib/router/resolver";
import {
  createHandlerRouter,
  createPageRouter,
  registerNotFoundHandler,
} from "./lib/router/runtime";
import type { SiteConfig } from "./render-document";

export type { AppEnv, PageLoader, RenderPage } from "./factory";
export type { RouteGlobs } from "./lib/router/resolver";
export type { SiteConfig } from "./render-document";

interface Middlewares {
  rsc: MiddlewareHandler<AppEnv>;
  ssr: MiddlewareHandler<AppEnv>;
}

export function createApp({
  middlewares,
  globs,
  site,
  notFoundPage,
}: {
  middlewares: Middlewares;
  globs: RouteGlobs;
  notFoundPage?: RouteLoader;
  site: SiteConfig;
}) {
  const app = new Hono<AppEnv>();
  const { routeMap: resolvedRouteMap, markdownSources } =
    buildRouteMap(globs);

  app.onError((err, c) => {
    console.error(err);
    return c.text("Internal Server Error", 500);
  });

  app.use("*", async (c, next) => {
    c.set("markdownSources", markdownSources);
    await next();
  });

  app.route(
    "/",
    createPageRouter(middlewares.rsc, resolvedRouteMap, site, "/__rsc")
  );
  app.route("/", createPageRouter(middlewares.ssr, resolvedRouteMap, site));
  app.route("/", createHandlerRouter(globs.handlers));

  if (notFoundPage) {
    const rootLayouts = resolveLayoutChain("/", globs.layouts);
    registerNotFoundHandler(app, middlewares.ssr, {
      page: notFoundPage,
      layouts: rootLayouts,
    }, site);
  }

  return app;
}
