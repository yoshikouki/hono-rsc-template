import { createFileRouter } from "@yoshikouki/hono-file-router";
import {
  type RenderHtml,
  type RenderRsc,
  rscRenderer,
} from "@yoshikouki/hono-rsc-renderer";
import { Hono } from "hono";
import type { Env } from "@/bindings";
import { AppLayout } from "@/components/app-layout";
import { Document } from "@/components/document";
import NotFound from "@/components/not-found";
import { createMarkdownRoutes } from "@/lib/markdown/routes";
import { markdownFiles, site } from "@/site";

interface AppOptions {
  renderHtml?: RenderHtml;
  renderRsc?: RenderRsc;
}

interface AppEnv {
  Bindings: Env;
}

const routeModules = import.meta.glob("./**/*.{ts,tsx}", {
  base: "./routes",
  eager: true,
});

const textProp = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const booleanProp = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>({ strict: false });

  app.use(
    "*",
    rscRenderer<AppEnv>(
      (props, c) => (
        <Document
          description={textProp(props.description)}
          jsonLd={Array.isArray(props.jsonLd) ? props.jsonLd : undefined}
          noindex={booleanProp(props.noindex)}
          ogImage={textProp(props.ogImage)}
          pathname={new URL(c.req.url).pathname}
          site={site}
          title={textProp(props.title) ?? site.name}
        >
          {props.children}
        </Document>
      ),
      options
    )
  );

  app.use("*", async (c, next) => {
    await next();
    if (
      site.speculationRulesPath &&
      c.res.headers.get("Content-Type")?.includes("text/html")
    ) {
      c.res.headers.set("Speculation-Rules", `"${site.speculationRulesPath}"`);
    }
  });

  app.onError((error, c) => {
    console.error(error);
    return c.text("Internal Server Error", 500);
  });

  app.route(
    "/",
    createMarkdownRoutes(markdownFiles, site.renderMarkdown, {
      filterDrafts: import.meta.env.PROD,
    })
  );
  app.route(
    "/",
    createFileRouter<AppEnv>({
      sources: [{ files: routeModules }],
      strict: false,
    })
  );

  app.notFound(async (c) => {
    const response = await c.render(
      <AppLayout>
        <NotFound />
      </AppLayout>,
      { noindex: true, title: "Not Found" }
    );
    return new Response(response.body, {
      status: 404,
      headers: response.headers,
    });
  });

  return app;
}

const app = createApp();

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
