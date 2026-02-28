import { createElement } from "react";
import { parseFrontmatter } from "@/lib/markdown/frontmatter";
import { renderMarkdownToReact } from "@/lib/markdown/render";

export type {
  LayoutModule,
  RouteLoader,
  RouteManifestEntry,
  RouteMeta,
  RouteModule,
} from "../../factory";

export interface LayoutEntry {
  file: string;
  loader: () => Promise<import("../../factory").LayoutModule>;
}

export interface ResolvedRoute {
  page: import("../../factory").RouteLoader;
  layouts: LayoutEntry[];
}

export interface RouteGlobs {
  pages: Record<string, () => Promise<import("../../factory").RouteModule>>;
  layouts: Record<string, () => Promise<import("../../factory").LayoutModule>>;
  handlers: Record<string, import("hono").Hono>;
  contents: Record<string, string>;
}

export interface BuildRouteMapResult {
  routeMap: Map<string, ResolvedRoute>;
  manifest: import("../../factory").RouteManifestEntry[];
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

export function handlerFileToPath(file: string): string {
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
  layouts: Record<string, () => Promise<import("../../factory").LayoutModule>>
): LayoutEntry[] {
  const segments = path.split("/").filter(Boolean);
  const directories = [""];

  for (let i = 0; i < segments.length - 1; i += 1) {
    directories.push(segments.slice(0, i + 1).join("/"));
  }

  const chain: LayoutEntry[] = [];
  for (const directory of directories) {
    const file = directory
      ? `../routes/${directory}/layout.tsx`
      : "../routes/layout.tsx";

    if (Object.hasOwn(layouts, file)) {
      chain.push({ file, loader: layouts[file] });
    }
  }

  return chain;
}

export function buildRouteMap(
  globs: Pick<RouteGlobs, "pages" | "contents" | "layouts">
): BuildRouteMapResult {
  const routeMap = new Map<string, ResolvedRoute>();
  const manifest: import("../../factory").RouteManifestEntry[] = [];
  const seen = new Map<string, string>();

  for (const [file, loader] of Object.entries(globs.pages)) {
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
    routeMap.set(path, {
      page: loader,
      layouts: resolveLayoutChain(path, globs.layouts),
    });
    manifest.push({ path, title: path, hasMarkdown: false });
  }

  for (const [file, raw] of Object.entries(globs.contents)) {
    const path = contentFileToPath(file);
    if (seen.has(path)) {
      continue;
    }

    seen.set(path, file);
    const frontmatter = parseFrontmatter(raw);
    routeMap.set(path, {
      page: () =>
        Promise.resolve({
          default: async () => {
            const { body } = parseFrontmatter(raw);
            const rendered = await renderMarkdownToReact(body);
            return createElement("article", null, rendered);
          },
          meta: {
            title: frontmatter.title || path,
            description: frontmatter.description,
            pathname: path,
            markdown: () => raw,
          },
        }),
      layouts: resolveLayoutChain(path, globs.layouts),
    });
    manifest.push({
      path,
      title: frontmatter.title || path,
      description: frontmatter.description,
      date: frontmatter.date,
      hasMarkdown: true,
    });
  }

  return { routeMap, manifest };
}
