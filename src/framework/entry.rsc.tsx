import { createMiddleware } from "hono/factory";
import type { Env } from "@/bindings";
import { type AppEnv, createApp, type PageLoader } from "@/index";

const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";

function createPageResponse(body: BodyInit | null, contentType: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
    },
  });
}

async function renderRscStream(loader: PageLoader): Promise<ReadableStream> {
  const [{ renderToReadableStream: render }, { default: Page }] =
    await Promise.all([import("@vitejs/plugin-rsc/rsc"), loader()]);
  return render(<Page />);
}

// RSC middleware — injects `renderPage` into context
// isRsc is passed by the caller (route handler), not determined here
const rscMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set(
    "renderPage",
    async (request: Request, loader: PageLoader, isRsc: boolean) => {
      const rscStream = await renderRscStream(loader);

      if (isRsc) {
        return createPageResponse(rscStream, RSC_CONTENT_TYPE);
      }

      // SSR: pipe RSC stream through SSR environment → HTML
      const ssrEntry = await import.meta.viteRsc.import<
        typeof import("./entry.ssr.tsx")
      >("./entry.ssr.tsx", { environment: "ssr" });
      const htmlStream = await ssrEntry.handleSsr(rscStream, {
        signal: request.signal,
      });
      return createPageResponse(htmlStream, HTML_CONTENT_TYPE);
    }
  );

  await next();
});

// Hono app handles ALL routes — RSC pages + API endpoints
const app = createApp(rscMiddleware);

// Cloudflare Workers calls fetch(request, env, ctx)
// - env: bindings (KV, D1, R2...) → available as c.env in Hono routes
// - ctx: ExecutionContext → available as c.executionCtx (e.g. ctx.waitUntil())
export default function handler(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Response | Promise<Response> {
  return app.fetch(request, env, ctx);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
