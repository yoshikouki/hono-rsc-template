import type { Hono } from "hono";
import type { JSX, ReactElement, ReactNode } from "react";

export interface RouteMeta {
  cacheControl?: string;
  date?: string;
  description?: string;
  draft?: boolean;
  jsonLd?: unknown[];
  markdown?: () => string | Promise<string>;
  noindex?: boolean;
  ogImage?: string;
  tags?: string[];
  title: string;
}

/** Public framework contract: pages may declare this to receive the request context. @public */
export interface PageProps<TContext = unknown> {
  context: TContext;
}

export interface RouteModule<TContext = unknown> {
  default: (props: PageProps<TContext>) => ReactElement | Promise<ReactElement>;
  meta?: RouteMeta;
}

export interface LayoutModule<TContext = unknown> {
  default: (props: { children: ReactNode; context: TContext }) => ReactElement;
}

export type RouteLoader<TContext = unknown> = () => Promise<
  RouteModule<TContext>
>;
export type LayoutLoader<TContext = unknown> = () => Promise<
  LayoutModule<TContext>
>;

export interface LayoutEntry<TContext = unknown> {
  file: string;
  load: LayoutLoader<TContext>;
}

export interface Route<TContext = unknown> {
  layouts: LayoutEntry<TContext>[];
  load: RouteLoader<TContext>;
  meta: RouteMeta;
  path: string;
}

export interface AppRoute<TContext = unknown> {
  load: RouteLoader<TContext>;
  meta: RouteMeta;
  path: string;
}

export interface RouteManifestEntry {
  date?: string;
  description?: string;
  path: string;
  title: string;
}

interface JsonLdContext {
  date?: string;
  description?: string;
  pathname: string;
  title: string;
}

export interface SiteConfig<TContext = unknown> {
  baseUrl: string;
  bodyClassName?: string;
  defaultJsonLd?: (context: JsonLdContext) => unknown[];
  defaultOgImage?: string;
  formatTitle?: (title: string, pathname: string) => string;
  head?: ReactNode | ((context: TContext) => ReactNode);
  htmlAttributes?: (context: TContext) => JSX.IntrinsicElements["html"];
  keywords?: string;
  lang?: string;
  name: string;
  ogLocale?: string;
  renderMarkdown?: (body: string) => Promise<ReactElement>;
  speculationRulesPath?: string;
  themeColor?: string;
  twitterCreator?: string;
  twitterSite?: string;
}

export interface RouteGlobs<TContext = unknown> {
  contents: Record<string, string>;
  handlers: Record<string, Hono>;
  layouts: Record<string, LayoutLoader<TContext>>;
  metas: Record<string, RouteMeta | undefined>;
  pages: Record<string, RouteLoader<TContext>>;
}

export interface AppEnv {
  Variables: {
    markdownSources: Map<string, () => Promise<string>>;
    routeManifest: RouteManifestEntry[];
    site: SiteConfig;
  };
}
