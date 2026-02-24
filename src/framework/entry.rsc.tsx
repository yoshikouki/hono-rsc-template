import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/bindings";
import { type AppEnv, createApp, type PageLoader } from "@/index";

const RSC_REQUEST_HEADER = "X-RSC-Request";
const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";

// Strip X-RSC-Request from external requests to prevent spoofing
export function sanitizeRscHeader(request: Request): Request {
  if (!request.headers.has(RSC_REQUEST_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(RSC_REQUEST_HEADER);
  return new Request(request, { headers });
}

function createPageResponse(body: BodyInit | null, contentType: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      // Vary tells CDNs that RSC and HTML responses differ for the same URL
      Vary: RSC_REQUEST_HEADER,
    },
  });
}

async function renderRscStream(loader: PageLoader): Promise<ReadableStream> {
  const [{ renderToReadableStream: render }, { default: Page }] =
    await Promise.all([import("@vitejs/plugin-rsc/rsc"), loader()]);
  return render(<Page />);
}

// RSC middleware — runs for every request, injects `renderPage` into context
const rscMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Accept RSC requests via either the internal header (set below in handler)
  // or the ?__rsc=1 search param as a fallback
  const isRsc =
    c.req.header(RSC_REQUEST_HEADER) === "1" ||
    c.req.query("__rsc") === "1";

  c.set("renderPage", async (request: Request, loader: PageLoader) => {
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
  });

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
  const sanitized = sanitizeRscHeader(request);
  const url = new URL(sanitized.url);

  // Convert ?__rsc=1 search param → X-RSC-Request: 1 header so that
  // rscMiddleware (and any downstream code) can rely on a single canonical
  // signal without having to parse query strings everywhere.
  // The param is left in the URL so Hono routes the same path for both HTML
  // and RSC requests without any URL rewriting.
  if (url.searchParams.get("__rsc") === "1") {
    const headers = new Headers(sanitized.headers);
    headers.set(RSC_REQUEST_HEADER, "1");
    return app.fetch(
      new Request(sanitized, { headers }),
      env,
      ctx
    );
  }

  return app.fetch(sanitized, env, ctx);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
