import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";
import { createMiddleware } from "hono/factory";
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
  const isRsc = c.req.header(RSC_REQUEST_HEADER) === "1";

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

export default function handler(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);

  // Convert .rsc suffix → X-RSC-Request: 1 header
  // This lets Hono route /page and /page.rsc with the same handler
  if (url.pathname.endsWith(".rsc")) {
    const cleanPath = url.pathname.slice(0, -4) || "/";
    const rewrittenUrl = new URL(cleanPath + url.search, url.origin);
    const sanitized = sanitizeRscHeader(request);
    const headers = new Headers(sanitized.headers);
    headers.set(RSC_REQUEST_HEADER, "1");
    return app.fetch(new Request(rewrittenUrl.toString(), { ...sanitized, headers }));
  }

  return app.fetch(sanitizeRscHeader(request));
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
