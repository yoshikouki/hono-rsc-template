import type { Hono } from "hono";
import type { ReactElement, ReactNode } from "react";

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

export interface RouteModule {
  default: () => ReactElement | Promise<ReactElement>;
  meta?: RouteMeta;
}

export interface LayoutModule {
  default: (props: { children: ReactNode }) => ReactElement;
}

export type RouteLoader = () => Promise<RouteModule>;
export type LayoutLoader = () => Promise<LayoutModule>;

export interface LayoutEntry {
  file: string;
  load: LayoutLoader;
}

export interface Route {
  layouts: LayoutEntry[];
  load: RouteLoader;
  meta: RouteMeta;
  path: string;
}

export interface RouteManifestEntry {
  date?: string;
  description?: string;
  path: string;
  title: string;
}

export interface JsonLdContext {
  date?: string;
  description?: string;
  pathname: string;
  title: string;
}

export interface SiteConfig {
  baseUrl: string;
  bodyClassName?: string;
  defaultJsonLd?: (context: JsonLdContext) => unknown[];
  defaultOgImage?: string;
  formatTitle?: (title: string, pathname: string) => string;
  head?: ReactNode;
  keywords?: string;
  lang?: string;
  name: string;
  ogLocale?: string;
  renderMarkdown?: (body: string) => Promise<ReactElement>;
  twitterCreator?: string;
  twitterSite?: string;
}

export interface RouteGlobs {
  contents: Record<string, string>;
  handlers: Record<string, Hono>;
  layouts: Record<string, LayoutLoader>;
  metas: Record<string, RouteMeta | undefined>;
  pages: Record<string, RouteLoader>;
}

export interface AppEnv {
  Variables: {
    markdownSources: Map<string, () => Promise<string>>;
    routeManifest: RouteManifestEntry[];
  };
}
