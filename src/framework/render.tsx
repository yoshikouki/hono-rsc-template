import type { ReactElement } from "react";
import { renderDocument } from "./document";
import type {
  LayoutModule,
  Route,
  RouteContext,
  RouteMeta,
  RouteModule,
  SiteConfig,
} from "./types";

export interface RenderRouteInput<TContext = unknown> {
  context?: TContext;
  noindex?: boolean;
  pathname: string;
  request: Request;
  route: Pick<Route<TContext>, "layouts" | "load">;
  site: SiteConfig<TContext>;
}

export type RenderRsc = (element: ReactElement) => Promise<ReadableStream>;

export interface RenderedRoute {
  meta: RouteMeta;
  stream: ReadableStream;
}

export function composeWithLayouts<TContext = unknown>(
  body: ReactElement,
  layoutModules: LayoutModule<TContext>[],
  context: TContext
): ReactElement {
  let composed = body;
  for (let i = layoutModules.length - 1; i >= 0; i -= 1) {
    composed = layoutModules[i].default({ children: composed, context });
  }
  return composed;
}

export function resolveJsonLd(
  site: SiteConfig,
  meta: {
    date?: string;
    description?: string;
    jsonLd?: unknown[];
    title: string;
  },
  pathname: string
): unknown[] {
  const context = {
    pathname,
    title: meta.title,
    description: meta.description,
    date: meta.date,
  };
  const defaultLd = site.defaultJsonLd?.(context) ?? [];
  return [...defaultLd, ...(meta.jsonLd ?? [])];
}

export async function resolveRouteMeta<TContext = unknown>(
  pageModule: Pick<RouteModule<TContext>, "resolveMeta">,
  context: RouteContext<TContext>
): Promise<RouteMeta> {
  return await pageModule.resolveMeta(context);
}

export async function buildDocumentElement<TContext = unknown>(
  input: RenderRouteInput<TContext>
): Promise<{ element: ReactElement; meta: RouteMeta }> {
  const { site, route, pathname } = input;
  const context = input.context as TContext;

  const [pageModule, ...layoutModules] = await Promise.all([
    route.load(),
    ...route.layouts.map(({ load }) => load()),
  ]);
  const routeContext = {
    context,
    params: {},
    pathname,
    request: input.request,
  };
  const meta = await resolveRouteMeta(pageModule, routeContext);
  const title = meta.title || pathname;

  const jsonLd = resolveJsonLd(
    site as SiteConfig<unknown>,
    {
      title,
      description: meta.description,
      date: meta.date,
      jsonLd: meta.jsonLd,
    },
    pathname
  );

  const body = composeWithLayouts(
    await pageModule.default({ context, params: routeContext.params }),
    layoutModules,
    context
  );

  return {
    element: renderDocument(site, {
      context,
      title,
      description: meta.description,
      pathname,
      jsonLd,
      noindex: input.noindex ?? meta.noindex,
      ogImage: meta.ogImage,
      body,
    }),
    meta,
  };
}

export async function renderRouteToRscStream<TContext = unknown>(
  input: RenderRouteInput<TContext>,
  renderRsc?: RenderRsc
): Promise<RenderedRoute> {
  const { element, meta } = await buildDocumentElement(input);

  if (renderRsc) {
    return { meta, stream: await renderRsc(element) };
  }

  const { renderToReadableStream } = await import("@vitejs/plugin-rsc/rsc");
  return { meta, stream: await renderToReadableStream(element) };
}
