import type { Hono } from "hono";
import type { MarkdownAdapter } from "./content/markdown";
import type {
  AppRoute,
  LayoutEntry,
  LayoutLoader,
  Route,
  RouteGlobs,
  RouteLoader,
} from "./types";

export interface Manifest<TContext = unknown> {
  handlers: Array<{ app: Hono; path: string }>;
  markdownSources: Map<string, () => Promise<string>>;
  routes: Route<TContext>[];
}

export interface BuildManifestOptions<TContext = unknown> {
  filterDrafts?: boolean;
  markdownAdapter: MarkdownAdapter;
  routes?: AppRoute<TContext>[];
}

const RE_ROUTE_PREFIX = /^(?:\.\.?\/)*routes\//;
const RE_TSX_EXT = /\.tsx$/;
const RE_TS_EXT = /\.ts$/;
const RE_MD_EXT = /\.md$/;
const RE_TRAILING_INDEX = /(^|\/)index$/;
const RE_LAYOUT_TSX_FILE = /(?:^|\/)layout\.tsx$/;
const RE_DYNAMIC_SEGMENT = /^\[([A-Za-z_$][\w$]*)\]$/;

interface ManifestPath {
  path: string;
  routeDirectory: string;
}

function stripRoutePrefix(file: string): string {
  return file.replace(RE_ROUTE_PREFIX, "");
}

function stripExtension(
  file: string,
  extension: ".md" | ".ts" | ".tsx"
): string {
  if (extension === ".tsx") {
    return file.replace(RE_TSX_EXT, "");
  }
  if (extension === ".ts") {
    return file.replace(RE_TS_EXT, "");
  }
  return file.replace(RE_MD_EXT, "");
}

function segmentToRoutePath(segment: string, file: string): string {
  const match = segment.match(RE_DYNAMIC_SEGMENT);
  if (match) {
    return `:${match[1]}`;
  }

  if (segment.includes("[") || segment.includes("]")) {
    throw new Error(
      `Unsupported dynamic route segment "${segment}" in ${file}. Only single segments like [id] are supported.`
    );
  }

  return segment;
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function routeFileToManifestPath(
  file: string,
  extension: ".ts" | ".tsx"
): ManifestPath {
  const withoutPrefix = stripRoutePrefix(file);
  const withoutExt = stripExtension(withoutPrefix, extension);
  const withoutIndex = withoutExt.replace(RE_TRAILING_INDEX, "");
  const pathSegments = withoutIndex
    .split("/")
    .filter(Boolean)
    .map((segment) => segmentToRoutePath(segment, file));

  return {
    path: pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "/",
    routeDirectory: RE_TRAILING_INDEX.test(withoutExt)
      ? withoutIndex
      : dirname(withoutExt),
  };
}

function fileToPath(file: string): ManifestPath {
  return routeFileToManifestPath(file, ".tsx");
}

function handlerFileToPath(file: string): string {
  return routeFileToManifestPath(file, ".ts").path;
}

function contentFileToPath(file: string): string {
  const withoutPrefix = stripRoutePrefix(file);
  const withoutExt = stripExtension(withoutPrefix, ".md");
  if (withoutExt.includes("[") || withoutExt.includes("]")) {
    throw new Error(
      `Markdown routes do not support dynamic segments in ${file}. Use a TSX route when params are needed.`
    );
  }
  return `/${withoutExt}`;
}

export function toMarkdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

export function resolveLayoutChain<TContext = unknown>(
  routeDirectory: string,
  layouts: Record<string, LayoutLoader<TContext>>
): LayoutEntry<TContext>[] {
  const segments = routeDirectory.split("/").filter(Boolean);
  const directories = [""];

  for (let i = 0; i < segments.length; i += 1) {
    directories.push(segments.slice(0, i + 1).join("/"));
  }

  const chain: LayoutEntry<TContext>[] = [];
  for (const directory of directories) {
    // Support both "./routes/" and "../routes/" glob patterns
    const candidates = directory
      ? [
          `./routes/${directory}/layout.tsx`,
          `../routes/${directory}/layout.tsx`,
        ]
      : ["./routes/layout.tsx", "../routes/layout.tsx"];

    for (const file of candidates) {
      if (Object.hasOwn(layouts, file)) {
        chain.push({ file, load: layouts[file] });
        break;
      }
    }
  }

  return chain;
}

function registerRouteEntry<TContext>(
  path: string,
  load: RouteLoader<TContext>,
  layouts: LayoutEntry<TContext>[],
  routes: Route<TContext>[]
): void {
  routes.push({ path, load, layouts });
}

export function buildManifest<TContext = unknown>(
  globs: RouteGlobs<TContext>,
  opts: BuildManifestOptions<TContext>
): Manifest<TContext> {
  const routes: Route<TContext>[] = [];
  const markdownSources = new Map<string, () => Promise<string>>();
  const seen = new Map<string, string>();

  // tsx pages
  for (const [file, load] of Object.entries(globs.pages)) {
    if (RE_LAYOUT_TSX_FILE.test(file)) {
      continue;
    }

    const { path, routeDirectory } = fileToPath(file);
    if (seen.has(path)) {
      throw new Error(
        `Duplicate route "${path}": ${seen.get(path)} and ${file}`
      );
    }

    seen.set(path, file);
    registerRouteEntry(
      path,
      load,
      resolveLayoutChain(routeDirectory, globs.layouts),
      routes
    );
  }

  // md contents
  for (const [file, raw] of Object.entries(globs.contents)) {
    const path = contentFileToPath(file);
    if (seen.has(path)) {
      continue;
    }

    const adapted = opts.markdownAdapter(raw, path);
    if (adapted.meta.draft && opts.filterDrafts) {
      continue;
    }

    seen.set(path, file);
    registerRouteEntry(
      path,
      adapted.load,
      resolveLayoutChain(path, globs.layouts),
      routes
    );
    markdownSources.set(path, () => Promise.resolve(raw));
  }

  // programmatic routes
  for (const appRoute of opts.routes ?? []) {
    const { path, load } = appRoute;
    if (seen.has(path)) {
      throw new Error(
        `Duplicate route "${path}": ${seen.get(path)} and programmatic route`
      );
    }
    seen.set(path, `programmatic:${path}`);
    registerRouteEntry(
      path,
      load,
      resolveLayoutChain(path, globs.layouts),
      routes
    );
  }

  // handlers
  const handlerSeen = new Map<string, string>();
  const handlers: Array<{ app: Hono; path: string }> = [];
  for (const [file, app] of Object.entries(globs.handlers)) {
    const path = handlerFileToPath(file);
    if (handlerSeen.has(path)) {
      throw new Error(
        `Duplicate handler route "${path}": ${handlerSeen.get(path)} and ${file}`
      );
    }
    handlerSeen.set(path, file);
    handlers.push({ path, app });
  }

  return { routes, markdownSources, handlers };
}
