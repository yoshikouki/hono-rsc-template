export interface RouteMeta {
  cacheControl?: string;
  date?: string;
  description?: string;
  jsonLd?: unknown[];
  markdown?: () => string | Promise<string>;
  ogImage?: string;
  pathname?: string;
  tags?: string[];
  title: string;
}

export interface RouteModule {
  default: () => React.ReactElement | Promise<React.ReactElement>;
  meta?: RouteMeta;
}

export interface LayoutModule {
  default: (props: { children: React.ReactNode }) => React.ReactElement;
}

export type RouteLoader = () => Promise<RouteModule>;

export type PageLoader = () => Promise<Pick<RouteModule, "default">>;

export type RenderPage = (
  request: Request,
  loader: PageLoader
) => Promise<Response>;

export interface RouteManifestEntry {
  date?: string;
  description?: string;
  hasMarkdown: boolean;
  path: string;
  title: string;
}

export interface AppEnv {
  Variables: {
    renderPage: RenderPage;
  };
}
