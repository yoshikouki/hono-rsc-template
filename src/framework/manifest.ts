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
const RSC_ROUTE_PREFIX = "/__rsc";

interface ManifestPath {
  path: string;
  routeDirectory: string;
}

interface RoutePathEntry {
  path: string;
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

export function hasDynamicRouteSegments(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith(":"));
}

export function routePathToShape(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? ":param" : segment));

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith(":");
}

export function routePathsOverlap(a: string, b: string): boolean {
  const aSegments = pathSegments(a);
  const bSegments = pathSegments(b);
  if (aSegments.length !== bSegments.length) {
    return false;
  }

  return aSegments.every((segment, index) => {
    const other = bSegments[index];
    return (
      segment === other || isDynamicSegment(segment) || isDynamicSegment(other)
    );
  });
}

function compareRouteSpecificity(a: string, b: string): number {
  const aSegments = pathSegments(a);
  const bSegments = pathSegments(b);
  const length = Math.min(aSegments.length, bSegments.length);

  for (let i = 0; i < length; i += 1) {
    const aDynamic = isDynamicSegment(aSegments[i]);
    const bDynamic = isDynamicSegment(bSegments[i]);
    if (aDynamic !== bDynamic) {
      return aDynamic ? 1 : -1;
    }
  }

  return bSegments.length - aSegments.length;
}

export function sortRoutesBySpecificity<T extends RoutePathEntry>(
  routes: T[]
): T[] {
  return routes
    .map((route, index) => ({ index, route }))
    .sort((a, b) => {
      const specificity = compareRouteSpecificity(a.route.path, b.route.path);
      return specificity === 0 ? a.index - b.index : specificity;
    })
    .map(({ route }) => route);
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

function rscPathFor(path: string): string {
  return path === "/" ? RSC_ROUTE_PREFIX : `${RSC_ROUTE_PREFIX}${path}`;
}

export function generatedRoutePathsForRoute(path: string): string[] {
  const paths = [rscPathFor(path)];
  if (!hasDynamicRouteSegments(path)) {
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
  return registered.find((entry) => routePathsOverlap(path, entry.path));
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
  if (!((a.generated || b.generated) && routePathsOverlap(a.path, b.path))) {
    return false;
  }

  if (
    a.generated &&
    b.generated &&
    routePathsOverlap(a.ownerPath, b.ownerPath) &&
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
    const shape = routePathToShape(path);
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

  return sortRoutesBySpecificity(handlers);
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
    const shape = routePathToShape(path);
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
    const shape = routePathToShape(path);
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
    const shape = routePathToShape(path);
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
    routes: sortRoutesBySpecificity(routes),
    markdownSources,
    handlers: buildHandlerEntries(globs.handlers, registeredPageLikeRoutes),
  };
}
