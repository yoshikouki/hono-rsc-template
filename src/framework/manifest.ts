import {
  hasDynamicRouteSegments as coreHasDynamicRouteSegments,
  routePathsOverlap as coreRoutePathsOverlap,
  routePathToShape as coreRoutePathToShape,
  sortRoutesBySpecificity as coreSortRoutesBySpecificity,
  routeFileToManifestPath as routeRootFileToManifestPath,
} from "@yoshikouki/hono-file-router";
import type { LayoutEntry, LayoutLoader } from "./types";

const RE_ROUTE_PREFIX = /^(?:\.\.?\/)*routes\//;
const RE_ROUTE_EXTENSION = /\.[^.]+$/;
const RE_SOURCE_PREFIX = /^\.\/+/;
const RE_TRAILING_INDEX = /(^|\/)index$/;

interface ManifestPath {
  path: string;
}

function stripRoutePrefix(file: string): string {
  return file.replace(RE_ROUTE_PREFIX, "");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function routeFileToManifestPath(
  file: string,
  _extension: ".md" | ".ts" | ".tsx"
): ManifestPath {
  return routeRootFileToManifestPath(stripRoutePrefix(file));
}

export function routeFileToLayoutDirectory(file: string): string {
  const stem = stripRoutePrefix(file)
    .replace(RE_SOURCE_PREFIX, "")
    .replace(RE_ROUTE_EXTENSION, "");
  const withoutIndex = trimSlashes(stem.replace(RE_TRAILING_INDEX, ""));

  if (!withoutIndex) {
    return "";
  }

  return stem === withoutIndex ? dirname(withoutIndex) : withoutIndex;
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

export function generatedRoutePathsForRoute(path: string): string[] {
  if (coreHasDynamicRouteSegments(path)) {
    return [];
  }
  return [toMarkdownPath(path)];
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
