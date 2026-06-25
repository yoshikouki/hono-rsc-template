import {
  hasDynamicRouteSegments as coreHasDynamicRouteSegments,
  routePathsOverlap as coreRoutePathsOverlap,
  routePathToShape as coreRoutePathToShape,
  sortRoutesBySpecificity as coreSortRoutesBySpecificity,
  routeFileToManifestPath as routeRootFileToManifestPath,
} from "@yoshikouki/hono-file-router";
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
const RE_MD_EXT = /\.md$/;
const RE_LAYOUT_TSX_FILE = /(?:^|\/)layout\.tsx$/;
const RSC_ROUTE_PREFIX = "/__rsc";

interface ManifestPath {
  path: string;
  routeDirectory: string;
}

interface RegisteredRoutePath {
  generated?: boolean;
  ownerPath: string;
  path: string;
  source: string;
}

function stripRoutePrefix(file: string): string {
  return file.replace(RE_ROUTE_PREFIX, "");
}

export function routeFileToManifestPath(
  file: string,
  _extension: ".ts" | ".tsx"
): ManifestPath {
  return routeRootFileToManifestPath(stripRoutePrefix(file));
}

function fileToPath(file: string): ManifestPath {
  return routeFileToManifestPath(file, ".tsx");
}

function handlerFileToPath(file: string): string {
  return routeFileToManifestPath(file, ".ts").path;
}

function contentFileToPath(file: string): string {
  const withoutPrefix = stripRoutePrefix(file);
  const withoutExt = withoutPrefix.replace(RE_MD_EXT, "");
  if (withoutExt.includes("[") || withoutExt.includes("]")) {
    throw new Error(
      `Markdown routes do not support dynamic segments in ${file}. Use a TSX route when params are needed.`
    );
  }
  return `/${withoutExt}`;
}

export function hasDynamicRouteSegments(path: string): boolean {
  return coreHasDynamicRouteSegments(path);
}

export function routePathsOverlap(a: string, b: string): boolean {
  return coreRoutePathsOverlap(a, b);
}

export function routePathToShape(path: string): string {
  return coreRoutePathToShape(path);
}

export function sortRoutesBySpecificity<T extends { path: string }>(
  routes: T[]
): T[] {
  return coreSortRoutesBySpecificity(routes);
}

export function toMarkdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

function rscPathFor(path: string): string {
  return path === "/" ? RSC_ROUTE_PREFIX : `${RSC_ROUTE_PREFIX}${path}`;
}

export function generatedRoutePathsForRoute(path: string): string[] {
  const paths = [rscPathFor(path)];
  if (!coreHasDynamicRouteSegments(path)) {
    paths.push(toMarkdownPath(path));
  }
  return paths;
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

function findOverlappingRoute(
  path: string,
  registered: RegisteredRoutePath[]
): RegisteredRoutePath | undefined {
  return registered.find((entry) => coreRoutePathsOverlap(path, entry.path));
}

function pageLikeRoutePathEntries(
  path: string,
  source: string
): RegisteredRoutePath[] {
  return [
    { ownerPath: path, path, source },
    ...generatedRoutePathsForRoute(path).map((generatedPath) => ({
      generated: true,
      ownerPath: path,
      path: generatedPath,
      source: `${source} generated route ${generatedPath}`,
    })),
  ];
}

function findGeneratedCollision(
  candidates: RegisteredRoutePath[],
  registered: RegisteredRoutePath[]
): { candidate: RegisteredRoutePath; existing: RegisteredRoutePath } | null {
  for (const candidate of candidates) {
    for (const existing of registered) {
      if (generatedRoutesConflict(candidate, existing)) {
        return { candidate, existing };
      }
    }
  }

  return null;
}

function isRscRoute(path: string): boolean {
  return path === RSC_ROUTE_PREFIX || path.startsWith(`${RSC_ROUTE_PREFIX}/`);
}

function generatedRoutesConflict(
  a: RegisteredRoutePath,
  b: RegisteredRoutePath
): boolean {
  if (
    !((a.generated || b.generated) && coreRoutePathsOverlap(a.path, b.path))
  ) {
    return false;
  }

  if (
    a.generated &&
    b.generated &&
    coreRoutePathsOverlap(a.ownerPath, b.ownerPath) &&
    !(isRscRoute(a.ownerPath) || isRscRoute(b.ownerPath))
  ) {
    return false;
  }

  if (isRscRoute(a.path) || isRscRoute(b.path)) {
    return true;
  }

  return a.path === b.path;
}

function assertNoGeneratedCollision(
  path: string,
  source: string,
  registered: RegisteredRoutePath[]
): RegisteredRoutePath[] {
  const candidates = pageLikeRoutePathEntries(path, source);
  const collision = findGeneratedCollision(candidates, registered);
  if (collision) {
    throw new Error(
      `Duplicate route "${collision.candidate.path}": ${collision.existing.source} and ${source}`
    );
  }

  return candidates;
}

function buildHandlerEntries(
  globHandlers: RouteGlobs["handlers"],
  registeredPageLikeRoutes: RegisteredRoutePath[]
): Array<{ app: Hono; path: string }> {
  const handlerSeen = new Map<string, string>();
  const handlers: Array<{ app: Hono; path: string }> = [];

  for (const [file, app] of Object.entries(globHandlers)) {
    const path = handlerFileToPath(file);
    const shape = coreRoutePathToShape(path);
    const overlappingRoute = findOverlappingRoute(
      path,
      registeredPageLikeRoutes
    );
    if (overlappingRoute) {
      throw new Error(
        `Duplicate route "${path}": ${overlappingRoute.source} and ${file}`
      );
    }
    if (handlerSeen.has(shape)) {
      throw new Error(
        `Duplicate handler route "${path}": ${handlerSeen.get(shape)} and ${file}`
      );
    }
    handlerSeen.set(shape, file);
    handlers.push({ path, app });
  }

  return coreSortRoutesBySpecificity(handlers);
}

export function buildManifest<TContext = unknown>(
  globs: RouteGlobs<TContext>,
  opts: BuildManifestOptions<TContext>
): Manifest<TContext> {
  const routes: Route<TContext>[] = [];
  const markdownSources = new Map<string, () => Promise<string>>();
  const seen = new Map<string, string>();
  const registeredPageLikeRoutes: RegisteredRoutePath[] = [];

  // tsx pages
  for (const [file, load] of Object.entries(globs.pages)) {
    if (RE_LAYOUT_TSX_FILE.test(file)) {
      continue;
    }

    const { path, routeDirectory } = fileToPath(file);
    const shape = coreRoutePathToShape(path);
    if (seen.has(shape)) {
      throw new Error(
        `Duplicate route "${path}": ${seen.get(shape)} and ${file}`
      );
    }

    const routePathEntries = assertNoGeneratedCollision(
      path,
      file,
      registeredPageLikeRoutes
    );
    seen.set(shape, file);
    registeredPageLikeRoutes.push(...routePathEntries);
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
    const shape = coreRoutePathToShape(path);
    if (seen.has(shape)) {
      throw new Error(
        `Duplicate route "${path}": ${seen.get(shape)} and ${file}`
      );
    }

    const adapted = opts.markdownAdapter(raw, path);
    if (adapted.meta.draft && opts.filterDrafts) {
      continue;
    }

    const routePathEntries = assertNoGeneratedCollision(
      path,
      file,
      registeredPageLikeRoutes
    );
    seen.set(shape, file);
    registeredPageLikeRoutes.push(...routePathEntries);
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
    const shape = coreRoutePathToShape(path);
    if (seen.has(shape)) {
      throw new Error(
        `Duplicate route "${path}": ${seen.get(shape)} and programmatic route`
      );
    }
    const source = `programmatic:${path}`;
    const routePathEntries = assertNoGeneratedCollision(
      path,
      source,
      registeredPageLikeRoutes
    );
    seen.set(shape, source);
    registeredPageLikeRoutes.push(...routePathEntries);
    registerRouteEntry(
      path,
      load,
      resolveLayoutChain(path, globs.layouts),
      routes
    );
  }

  return {
    routes: coreSortRoutesBySpecificity(routes),
    markdownSources,
    handlers: buildHandlerEntries(globs.handlers, registeredPageLikeRoutes),
  };
}
