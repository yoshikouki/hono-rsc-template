import type { ReactElement } from "react";
import { renderDocument } from "./document";
import type { LayoutModule, Route, SiteConfig } from "./types";

export interface RenderRouteInput {
  noindex?: boolean;
  pathname: string;
  route: Pick<Route, "layouts" | "load" | "meta">;
  site: SiteConfig;
}

export type RenderRsc = (element: ReactElement) => Promise<ReadableStream>;

export function composeWithLayouts(
  body: ReactElement,
  layoutModules: LayoutModule[]
): ReactElement {
  let composed = body;
  for (let i = layoutModules.length - 1; i >= 0; i -= 1) {
    composed = layoutModules[i].default({ children: composed });
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

export async function buildDocumentElement(
  input: RenderRouteInput
): Promise<ReactElement> {
  const { site, route, pathname } = input;
  const meta = route.meta;
  const title = meta.title || pathname;

  const [pageModule, ...layoutModules] = await Promise.all([
    route.load(),
    ...route.layouts.map(({ load }) => load()),
  ]);

  const jsonLd = resolveJsonLd(
    site,
    {
      title,
      description: meta.description,
      date: meta.date,
      jsonLd: meta.jsonLd,
    },
    pathname
  );

  const body = composeWithLayouts(await pageModule.default(), layoutModules);

  return renderDocument(site, {
    title,
    description: meta.description,
    pathname,
    jsonLd,
    noindex: input.noindex ?? meta.noindex,
    ogImage: meta.ogImage,
    body,
  });
}

export async function renderRouteToRscStream(
  input: RenderRouteInput,
  renderRsc?: RenderRsc
): Promise<ReadableStream> {
  const element = await buildDocumentElement(input);

  if (renderRsc) {
    return renderRsc(element);
  }

  const { renderToReadableStream } = await import("@vitejs/plugin-rsc/rsc");
  return renderToReadableStream(element);
}
