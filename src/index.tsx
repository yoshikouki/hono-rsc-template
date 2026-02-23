import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";

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
  Variables: {
    renderPage: RenderPage;
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApp(rscMiddleware: MiddlewareHandler<AppEnv>) {
  const app = new Hono<AppEnv>();

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
