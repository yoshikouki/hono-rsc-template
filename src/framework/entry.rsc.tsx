import { createMiddleware } from "hono/factory";
import type { LayoutModule } from "@/factory";
import {
  type AppEnv,
  createApp,
  type PageLoader,
  type RouteGlobs,
  type SiteConfig,
} from "@/index";
import type { RouteModule } from "@/lib/router/resolver";

const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";

export function createPageResponse(
  body: BodyInit | null,
  contentType: string
): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
    },
  });
}

async function renderRscStream(loader: PageLoader): Promise<ReadableStream> {
  const [{ renderToReadableStream }, { default: Page }] = await Promise.all([
    import("@vitejs/plugin-rsc/rsc"),
    loader(),
  ]);
  return renderToReadableStream(<Page />);
}

const rscMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("renderPage", async (_request: Request, loader: PageLoader) => {
    const rscStream = await renderRscStream(loader);
    return createPageResponse(rscStream, RSC_CONTENT_TYPE);
  });
  await next();
});

const ssrMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("renderPage", async (request: Request, loader: PageLoader) => {
    const rscStream = await renderRscStream(loader);
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

const globs: RouteGlobs = {
  pages: import.meta.glob<RouteModule>("../routes/**/*.tsx"),
  layouts: import.meta.glob<LayoutModule>("../routes/**/layout.tsx"),
  handlers: import.meta.glob("../routes/**/*.ts", {
    eager: true,
    import: "default",
  }),
  contents: import.meta.glob<string>("../routes/**/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
};

const site: SiteConfig = {
  name: "My App",
  baseUrl: "http://localhost:5173",
  lang: "en",
};

const app = createApp({
  middlewares: { rsc: rscMiddleware, ssr: ssrMiddleware },
  globs,
  site,
});

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
