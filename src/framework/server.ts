import {
  pathnameFromRoutePath as corePathnameFromRoutePath,
  createRouteManifest,
  type FileRoute,
  type FileRouteRenderer,
  type GlobFiles,
  mountFileRoutes,
  type RenderInput,
  type RouteManifest,
  type RouteSource,
} from "@yoshikouki/hono-file-router";
import { Hono } from "hono";
import {
  createMarkdownAdapter,
  type MarkdownAdapter,
} from "./content/markdown";
import { markdownResponse } from "./content/response";
import {
  hasDynamicRouteSegments,
  resolveLayoutChain,
  routeFileToLayoutDirectory,
  routeFileToManifestPath,
  toMarkdownPath,
} from "./manifest";
import { renderRouteToRscStream, resolveRouteMeta } from "./render";
import type {
  AppEnv,
  AppRoute,
  Route,
  RouteGlobs,
  RouteLoader,
  RouteManifestEntry,
  RouteModule,
  SiteConfig,
} from "./types";

const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const RSC_CACHE_CONTROL = "private, no-store";
const RSC_VARY_HEADERS = ["RSC", "Accept"];
const RE_HONO_CATCH_ALL_PARAM = /^([A-Za-z_$][\w$]*)\{\.\+\}$/;
const RE_LAYOUT_TSX_FILE = /(?:^|\/)layout\.tsx$/;
const RE_MARKDOWN_EXT = /\.md$/;
const RE_ROUTE_PREFIX = /^(?:\.\.?\/)*routes\//;

export function pathnameFromRoutePath(
  routePath: string,
  params: Record<string, string>
): string {
  return corePathnameFromRoutePath(routePath, params);
}

type RenderRsc = Parameters<typeof renderRouteToRscStream>[1];

type RenderHtml = (
  rscStream: ReadableStream,
  options: { signal: AbortSignal }
) => Promise<ReadableStream>;

export interface Renderer {
  renderHtml?: RenderHtml;
  renderRsc?: RenderRsc;
}

type AppFileRoute<TContext = unknown> = FileRoute<RouteModule<TContext>>;

interface AppRendererOptions<TContext = unknown> {
  layouts: RouteGlobs<TContext>["layouts"];
  renderHtml: RenderHtml;
  renderRsc?: RenderRsc;
  site: SiteConfig<TContext>;
}

interface CreateAppOptions<TContext = unknown> {
  createRequestContext?: (request: Request) => TContext | Promise<TContext>;
  globs: RouteGlobs<TContext>;
  notFound?: RouteLoader<TContext>;
  renderer?: Renderer;
  routes?: AppRoute<TContext>[];
  site: SiteConfig<TContext>;
}

interface PreparedMarkdownRoutes<TContext = unknown> {
  files: GlobFiles<RouteModule<TContext>>;
  markdownSources: Map<string, () => Promise<string>>;
}

async function defaultRenderHtml(
  rscStream: ReadableStream,
  options: { signal: AbortSignal }
): Promise<ReadableStream> {
  // import.meta.viteRsc.import is statically transformed by @vitejs/plugin-rsc.
  const ssrEntry = await import.meta.viteRsc.import<
    typeof import("@yoshikouki/hono-rsc-renderer/entry.ssr")
  >("@yoshikouki/hono-rsc-renderer/entry.ssr", { environment: "ssr" });
  return ssrEntry.renderHtml(rscStream, options);
}

function appendVary(headers: Headers, names: string[]): void {
  const existing = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  );
  for (const name of names) {
    existing.add(name);
  }
  headers.set("Vary", [...existing].join(", "));
}

function isRscRequest(request: Request): boolean {
  const accept = request.headers.get("Accept") ?? "";
  return (
    request.headers.get("RSC") === "1" || accept.includes("text/x-component")
  );
}

async function renderHtmlResponse(
  request: Request,
  rscStream: ReadableStream,
  renderHtml: RenderHtml
): Promise<Response> {
  const htmlStream = await renderHtml(rscStream, { signal: request.signal });
  const response = new Response(htmlStream, {
    headers: {
      "Content-Type": HTML_CONTENT_TYPE,
    },
  });
  appendVary(response.headers, RSC_VARY_HEADERS);
  return response;
}

function renderRscResponse(
  rscStream: ReadableStream,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", RSC_CONTENT_TYPE);
  headers.set("Cache-Control", RSC_CACHE_CONTROL);
  appendVary(headers, RSC_VARY_HEADERS);
  return new Response(rscStream, { ...init, headers });
}

export function includeRouteManifestEntry(
  entry: { draft?: boolean },
  env: Pick<ImportMetaEnv, "PROD"> = import.meta.env
): boolean {
  return !(entry.draft && env.PROD);
}

function routeSourceKey(file: string): string {
  return file.replace(RE_ROUTE_PREFIX, "");
}

function routeSourceFiles<T>(
  files: Record<string, T>,
  options: { excludeLayouts?: boolean } = {}
): GlobFiles<T> {
  const entries = Object.entries(files).flatMap(([file, value]) => {
    if (options.excludeLayouts && RE_LAYOUT_TSX_FILE.test(file)) {
      return [];
    }
    return [[routeSourceKey(file), value] as const];
  });
  return Object.fromEntries(entries);
}

function programmaticRouteFile(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return "index.tsx";
  }

  const fileSegments = trimmed.split("/").map((segment) => {
    if (!segment.startsWith(":")) {
      return segment;
    }

    const param = segment.slice(1);
    const catchAll = param.match(RE_HONO_CATCH_ALL_PARAM);
    if (catchAll) {
      return `[...${catchAll[1]}]`;
    }

    return `[${param}]`;
  });

  return `${fileSegments.join("/")}.tsx`;
}

function renderableRoute<TContext>(
  route: AppFileRoute<TContext>,
  layouts: RouteGlobs<TContext>["layouts"]
): Pick<Route<TContext>, "layouts" | "load"> {
  if (!route.load) {
    throw new Error(`Route "${route.path}" does not have a loader.`);
  }
  return {
    load: route.load,
    layouts: resolveLayoutChain(
      routeFileToLayoutDirectory(route.file),
      layouts
    ),
  };
}

async function renderAppRoute<TContext>(
  input: RenderInput<TContext, RouteModule<TContext>>,
  options: AppRendererOptions<TContext>
): Promise<{
  meta: Awaited<ReturnType<typeof renderRouteToRscStream>>["meta"];
  response: Response;
}> {
  const rscStream = await renderRouteToRscStream(
    {
      site: options.site,
      route: renderableRoute(input.route, options.layouts),
      pathname: input.pathname,
      request: input.request,
      context: input.context,
      params: input.params,
    },
    options.renderRsc
  );

  if (isRscRequest(input.request)) {
    return {
      meta: rscStream.meta,
      response: renderRscResponse(rscStream.stream),
    };
  }

  const response = await renderHtmlResponse(
    input.request,
    rscStream.stream,
    options.renderHtml
  );

  if (rscStream.meta.cacheControl) {
    response.headers.set("Cache-Control", rscStream.meta.cacheControl);
  }

  return { meta: rscStream.meta, response };
}

function createPageRenderer<TContext>(
  options: AppRendererOptions<TContext>
): FileRouteRenderer<TContext, RouteModule<TContext>> {
  return {
    name: "template-rsc-page",
    accepts(route) {
      return route.file.endsWith(".tsx");
    },
    generatedRoutes(route) {
      if (hasDynamicRouteSegments(route.path)) {
        return [];
      }

      return [
        {
          method: "GET" as const,
          owner: route.id,
          path: toMarkdownPath(route.path),
          async render(input: RenderInput<TContext, RouteModule<TContext>>) {
            const pageModule = await input.route.load?.();
            if (!pageModule) {
              return new Response("Not Found", { status: 404 });
            }
            const meta = await resolveRouteMeta(pageModule, {
              context: input.context,
              params: input.params,
              pathname: input.pathname,
              request: input.request,
            });
            const markdown = await meta.markdown?.();
            if (!markdown) {
              return new Response("Not Found", { status: 404 });
            }
            return markdownResponse(markdown);
          },
        },
      ];
    },
    async render(input) {
      return (await renderAppRoute(input, options)).response;
    },
  };
}

function createMarkdownRenderer<TContext>(
  options: AppRendererOptions<TContext> & {
    markdownSources: Map<string, () => Promise<string>>;
  }
): FileRouteRenderer<TContext, RouteModule<TContext>> {
  return {
    name: "template-markdown",
    accepts(route) {
      return route.file.endsWith(".md");
    },
    generatedRoutes(route) {
      return [
        {
          method: "GET",
          owner: route.id,
          path: toMarkdownPath(route.path),
          async render() {
            const getMarkdown = options.markdownSources.get(route.path);
            if (!getMarkdown) {
              return new Response("Not Found", { status: 404 });
            }
            return markdownResponse(await getMarkdown());
          },
        },
      ];
    },
    async render(input) {
      return (await renderAppRoute(input, options)).response;
    },
  };
}

function prepareMarkdownRoutes<TContext>(
  contents: RouteGlobs<TContext>["contents"],
  markdownAdapter: MarkdownAdapter,
  options: { filterDrafts?: boolean }
): PreparedMarkdownRoutes<TContext> {
  const files: GlobFiles<RouteModule<TContext>> = {};
  const markdownSources = new Map<string, () => Promise<string>>();

  for (const [file, raw] of Object.entries(contents)) {
    const sourceKey = routeSourceKey(file);
    const sourceWithoutExt = sourceKey.replace(RE_MARKDOWN_EXT, "");
    if (sourceWithoutExt.includes("[") || sourceWithoutExt.includes("]")) {
      throw new Error(
        `Markdown routes do not support dynamic segments in ${file}. Use a TSX route when params are needed.`
      );
    }

    const path = routeFileToManifestPath(file, ".md").path;
    const adapted = markdownAdapter(raw, path);
    if (adapted.meta.draft && options.filterDrafts) {
      continue;
    }

    files[sourceKey] = adapted.load as () => Promise<RouteModule<TContext>>;
    markdownSources.set(path, () => Promise.resolve(raw));
  }

  return { files, markdownSources };
}

function appRouteFiles<TContext>(
  appRoutes: AppRoute<TContext>[] | undefined
): GlobFiles<RouteModule<TContext>> {
  return Object.fromEntries(
    (appRoutes ?? []).map((route) => [
      programmaticRouteFile(route.path),
      route.load,
    ])
  );
}

function createAppRouteManifest<TContext>(
  globs: RouteGlobs<TContext>,
  options: AppRendererOptions<TContext> & {
    appRoutes?: AppRoute<TContext>[];
    markdownAdapter: MarkdownAdapter;
  }
): {
  manifest: RouteManifest<TContext, RouteModule<TContext>>;
  markdownSources: Map<string, () => Promise<string>>;
} {
  const markdown = prepareMarkdownRoutes(
    globs.contents,
    options.markdownAdapter,
    {
      filterDrafts: import.meta.env.PROD,
    }
  );
  const pageRenderer = createPageRenderer(options);
  const markdownRenderer = createMarkdownRenderer({
    ...options,
    markdownSources: markdown.markdownSources,
  });

  const sources: RouteSource<TContext, RouteModule<TContext>>[] = [
    {
      files: routeSourceFiles(globs.pages, { excludeLayouts: true }),
      renderer: pageRenderer,
    },
    {
      files: markdown.files,
      renderer: markdownRenderer,
    },
    {
      files: appRouteFiles(options.appRoutes),
      renderer: pageRenderer,
    },
    {
      files: routeSourceFiles(globs.handlers),
    },
  ];

  return {
    manifest: createRouteManifest({ sources }) as RouteManifest<
      TContext,
      RouteModule<TContext>
    >,
    markdownSources: markdown.markdownSources,
  };
}

async function collectRouteManifest<TContext = unknown>(
  routes: AppFileRoute<TContext>[],
  request: Request,
  context: TContext
): Promise<RouteManifestEntry[]> {
  const entries: RouteManifestEntry[] = [];

  for (const route of routes) {
    const pageModule = await route.load?.();
    if (!pageModule) {
      continue;
    }
    if (pageModule.enumerate) {
      entries.push(
        ...(await pageModule.enumerate({ context, request })).filter((entry) =>
          includeRouteManifestEntry(entry)
        )
      );
      continue;
    }

    if (hasDynamicRouteSegments(route.path)) {
      continue;
    }

    const meta = await resolveRouteMeta(pageModule, {
      context,
      params: {},
      pathname: route.path,
      request,
    });

    if (!includeRouteManifestEntry(meta)) {
      continue;
    }

    entries.push({
      path: route.path,
      title: meta.title || route.path,
      description: meta.description,
      date: meta.date,
    });
  }

  return entries;
}

export function createApp<TContext = unknown>({
  site,
  globs,
  notFound,
  renderer = {},
  routes: appRoutes,
  createRequestContext,
}: CreateAppOptions<TContext>): Hono<AppEnv> {
  const app = new Hono<AppEnv>({ strict: false });

  const markdownAdapter = createMarkdownAdapter(
    site.renderMarkdown ??
      (async (body) => {
        const { createElement } = await import("react");
        return createElement("pre", null, body);
      })
  );

  const renderRsc = renderer.renderRsc;
  const renderHtml = renderer.renderHtml ?? defaultRenderHtml;
  const { manifest, markdownSources } = createAppRouteManifest<TContext>(
    globs,
    {
      site,
      layouts: globs.layouts,
      renderRsc,
      renderHtml,
      appRoutes,
      markdownAdapter,
    }
  );

  // Global middleware
  app.use("*", async (c, next) => {
    c.set("site", site as SiteConfig);
    c.set("markdownSources", markdownSources);
    c.set("routeManifest", async () => {
      const context = createRequestContext
        ? await createRequestContext(c.req.raw)
        : (undefined as TContext);
      return collectRouteManifest(
        manifest.routes as AppFileRoute<TContext>[],
        c.req.raw,
        context
      );
    });
    await next();
    if (
      site.speculationRulesPath &&
      c.res.headers.get("Content-Type")?.includes("text/html")
    ) {
      c.res.headers.set("Speculation-Rules", `"${site.speculationRulesPath}"`);
    }
  });

  app.onError((err, c) => {
    console.error(err);
    return c.text("Internal Server Error", 500);
  });

  mountFileRoutes(app, {
    manifest,
    createContext: createRequestContext,
  });

  // Not found
  if (notFound) {
    app.get("*", async (c) => {
      const requestPathname = new URL(c.req.url).pathname;
      const context = createRequestContext
        ? await createRequestContext(c.req.raw)
        : (undefined as TContext);
      const route = {
        load: notFound,
        layouts: resolveLayoutChain("/", globs.layouts),
      };
      const rscStream = await renderRouteToRscStream(
        {
          site,
          route,
          pathname: requestPathname,
          request: c.req.raw,
          noindex: true,
          context,
        },
        renderRsc
      );

      if (isRscRequest(c.req.raw)) {
        return renderRscResponse(rscStream.stream, { status: 404 });
      }

      const response = await renderHtmlResponse(
        c.req.raw,
        rscStream.stream,
        renderHtml
      );

      return new Response(response.body, {
        status: 404,
        headers: response.headers,
      });
    });
  }

  return app;
}
