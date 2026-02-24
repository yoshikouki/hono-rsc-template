import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { Env } from "@/bindings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageLoader = () => Promise<{
  default: () => React.ReactElement | Promise<React.ReactElement>;
}>;

export type RenderPage = (
  request: Request,
  loader: PageLoader
) => Promise<Response>;

export interface AppEnv {
  Bindings: Env; // Cloudflare Workers bindings — access via c.env.MY_KV etc.
  Variables: {
    renderPage: RenderPage;
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApp(rscMiddleware: MiddlewareHandler<AppEnv>) {
  const app = new Hono<AppEnv>();

  // Example: access bindings inside a route via c.env
  // app.get("/api/kv", (c) => c.env.MY_KV.get("key"))

  // RSC middleware injects `renderPage` into context for all routes
  app.use("*", rscMiddleware);

  // --- Page routes ---
  // Each route calls renderPage(request, loader) which:
  //   - for .rsc requests: returns RSC stream (React Flight Protocol)
  //   - for HTML requests: returns SSR-rendered HTML stream
  app.get("/", (c) =>
    c
      .get("renderPage")(
        c.req.raw,
        () => import("@/pages/home").then((m) => ({ default: m.HomePage }))
      )
  );

  // --- API routes ---
  app.get("/api/hello", (c) => {
    return c.json({ message: "Hello from Hono!", timestamp: Date.now() });
  });

  app.get("/healthz", (c) => c.text("ok"));

  return app;
}
