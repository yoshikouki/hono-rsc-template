import type { ReactElement } from "react";
import { renderDocument } from "./document";
import type { LayoutModule, Route, SiteConfig } from "./types";

export interface RenderRouteInput<TContext = unknown> {
  context?: TContext;
  noindex?: boolean;
  pathname: string;
  route: Pick<Route<TContext>, "layouts" | "load" | "meta">;
  site: SiteConfig<TContext>;
}

export type RenderRsc = (element: ReactElement) => Promise<ReadableStream>;

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

export async function buildDocumentElement<TContext = unknown>(
  input: RenderRouteInput<TContext>
): Promise<ReactElement> {
  const { site, route, pathname } = input;
  const context = input.context as TContext;
  const meta = route.meta;
  const title = meta.title || pathname;

  const [pageModule, ...layoutModules] = await Promise.all([
    route.load(),
    ...route.layouts.map(({ load }) => load()),
  ]);

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
    await pageModule.default({ context }),
    layoutModules,
    context
  );

  return renderDocument(site, {
    context,
    title,
    description: meta.description,
    pathname,
    jsonLd,
    noindex: input.noindex ?? meta.noindex,
    ogImage: meta.ogImage,
    body,
  });
}

export async function renderRouteToRscStream<TContext = unknown>(
  input: RenderRouteInput<TContext>,
  renderRsc?: RenderRsc
): Promise<ReadableStream> {
  const element = await buildDocumentElement(input);

  if (renderRsc) {
    return renderRsc(element);
  }

  const { renderToReadableStream } = await import("@vitejs/plugin-rsc/rsc");
  return renderToReadableStream(element);
}
