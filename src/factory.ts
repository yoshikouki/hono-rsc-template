export interface RouteMeta {
  title: string;
  description?: string;
  date?: string;
  tags?: string[];
  pathname?: string;
  jsonLd?: unknown[];
  ogImage?: string;
  markdown?: () => string | Promise<string>;
  cacheControl?: string;
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
  path: string;
  title: string;
  description?: string;
  date?: string;
  hasMarkdown: boolean;
}

export interface AppEnv {
  Variables: {
    renderPage: RenderPage;
  };
}
