import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "./factory";
import { buildRouteMap, type RouteGlobs } from "./lib/router/resolver";
import { createHandlerRouter, createPageRouter } from "./lib/router/runtime";
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
}: {
  middlewares: Middlewares;
  globs: RouteGlobs;
  site: SiteConfig;
}) {
  const app = new Hono<AppEnv>();
  const { routeMap: resolvedRouteMap } = buildRouteMap(globs);

  app.onError((err, c) => {
    console.error(err);
    return c.text("Internal Server Error", 500);
  });

  app.route(
    "/",
    createPageRouter(middlewares.rsc, resolvedRouteMap, site, "/__rsc")
  );
  app.route("/", createPageRouter(middlewares.ssr, resolvedRouteMap, site));
  app.route("/", createHandlerRouter(globs.handlers));

  return app;
}
