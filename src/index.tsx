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
  loader: PageLoader,
  isRsc: boolean
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

  // --- Page routes ---
  // rscMiddleware is applied per-route to inject `renderPage` into context.
  // Each route calls renderPage(request, loader, isRsc) which:
  //   - isRsc=true:  returns RSC stream (React Flight Protocol)
  //   - isRsc=false: returns SSR-rendered HTML stream
  app.get("/", rscMiddleware, (c) =>
    c.get("renderPage")(
      c.req.raw,
      () => import("@/routes/home").then((m) => ({ default: m.HomePage })),
      false
    )
  );

  // --- RSC payload routes ---
  // /__rsc/* routes return raw RSC streams for client-side navigation/hydration
  app.get("/__rsc/", rscMiddleware, (c) =>
    c.get("renderPage")(
      c.req.raw,
      () => import("@/routes/home").then((m) => ({ default: m.HomePage })),
      true
    )
  );

  // --- API routes ---
  app.get("/api/hello", (c) => {
    return c.json({ message: "Hello from Hono!", timestamp: Date.now() });
  });

  // Reads GREETING from wrangler.toml [vars] via c.env
  app.get("/api/env", (c) => {
    return c.json({
      greeting: c.env.GREETING,
      note: "This value comes from wrangler.toml [vars] → c.env",
    });
  });

  app.get("/healthz", (c) => c.text("ok"));

  return app;
}
