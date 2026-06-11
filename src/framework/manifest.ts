import type { Hono } from "hono";
import type { MarkdownAdapter } from "./content/markdown";
import type {
  LayoutEntry,
  LayoutLoader,
  Route,
  RouteGlobs,
  RouteManifestEntry,
  RouteMeta,
} from "./types";

export interface Manifest {
  entries: RouteManifestEntry[];
  handlers: Array<{ app: Hono; path: string }>;
  markdownSources: Map<string, () => Promise<string>>;
  routes: Route[];
}

export interface BuildManifestOptions {
  filterDrafts?: boolean;
  markdownAdapter: MarkdownAdapter;
}

const RE_ROUTE_PREFIX = /^(?:\.\.?\/)*routes\//;
const RE_TSX_EXT = /\.tsx$/;
const RE_TS_EXT = /\.ts$/;
const RE_MD_EXT = /\.md$/;
const RE_TRAILING_INDEX = /(^|\/)index$/;
const RE_LAYOUT_TSX_FILE = /(?:^|\/)layout\.tsx$/;

function fileToPath(file: string): string {
  const withoutPrefix = file.replace(RE_ROUTE_PREFIX, "");
  const withoutExt = withoutPrefix.replace(RE_TSX_EXT, "");
  const withoutIndex = withoutExt.replace(RE_TRAILING_INDEX, "");
  return withoutIndex ? `/${withoutIndex}` : "/";
}

function handlerFileToPath(file: string): string {
  const withoutPrefix = file.replace(RE_ROUTE_PREFIX, "");
  const withoutExt = withoutPrefix.replace(RE_TS_EXT, "");
  const withoutIndex = withoutExt.replace(RE_TRAILING_INDEX, "");
  return withoutIndex ? `/${withoutIndex}` : "/";
}

function contentFileToPath(file: string): string {
  const withoutPrefix = file.replace(RE_ROUTE_PREFIX, "");
  const withoutExt = withoutPrefix.replace(RE_MD_EXT, "");
  return `/${withoutExt}`;
}

export function toMarkdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

export function resolveLayoutChain(
  path: string,
  layouts: Record<string, LayoutLoader>
): LayoutEntry[] {
  const segments = path.split("/").filter(Boolean);
  const directories = [""];

  for (let i = 0; i < segments.length; i += 1) {
    directories.push(segments.slice(0, i + 1).join("/"));
  }

  const chain: LayoutEntry[] = [];
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

export function buildManifest(
  globs: RouteGlobs,
  opts: BuildManifestOptions
): Manifest {
  const routes: Route[] = [];
  const entries: RouteManifestEntry[] = [];
  const markdownSources = new Map<string, () => Promise<string>>();
  const seen = new Map<string, string>();

  // tsx pages
  for (const [file, load] of Object.entries(globs.pages)) {
    if (RE_LAYOUT_TSX_FILE.test(file)) {
      continue;
    }

    const path = fileToPath(file);
    if (seen.has(path)) {
      throw new Error(
        `Duplicate route "${path}": ${seen.get(path)} and ${file}`
      );
    }

    seen.set(path, file);

    const rawMeta = globs.metas[file];
    const meta: RouteMeta = rawMeta ?? { title: path };

    routes.push({
      path,
      meta,
      load,
      layouts: resolveLayoutChain(path, globs.layouts),
    });

    entries.push({
      path,
      title: meta.title || path,
      description: meta.description,
      date: meta.date,
    });

    if (meta.markdown) {
      const markdown = meta.markdown;
      markdownSources.set(path, () => Promise.resolve(markdown()));
    }
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

    routes.push({
      path,
      meta: adapted.meta,
      load: adapted.load,
      layouts: resolveLayoutChain(path, globs.layouts),
    });

    entries.push({
      path,
      title: adapted.meta.title || path,
      description: adapted.meta.description,
      date: adapted.meta.date,
    });

    markdownSources.set(path, () => Promise.resolve(raw));
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

  return { routes, entries, markdownSources, handlers };
}
