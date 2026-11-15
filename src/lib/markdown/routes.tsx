import { createRouteManifest } from "@yoshikouki/hono-file-router";
import { Hono } from "hono";
import type { ReactElement } from "react";
import { parseFrontmatter } from "./frontmatter";
import { markdownResponse } from "./response";

export interface MarkdownManifestEntry {
  date?: string;
  description?: string;
  path: string;
  title: string;
}

export type MarkdownFiles = Record<string, string>;
export type RenderMarkdown = (body: string) => Promise<ReactElement>;

interface MarkdownRoute {
  body: string;
  date?: string;
  description?: string;
  draft?: boolean;
  path: string;
  raw: string;
  title: string;
}

interface MarkdownRouteOptions {
  filterDrafts?: boolean;
}

const RE_ROUTE_PREFIX = /^(?:\.\/)?routes\//u;

export function toMarkdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

function sourceKey(file: string): string {
  return file.replace(RE_ROUTE_PREFIX, "");
}

function hasDynamicRouteSegments(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith(":"));
}

// Resolve paths with the same file convention as the page router. The
// manifest is only read for paths and is never mounted.
function routePaths(files: MarkdownFiles): Map<string, string> {
  const { routes } = createRouteManifest({
    sources: {
      files,
      renderer: {
        accepts: () => true,
        name: "markdown",
        render: ({ c }) => c.notFound(),
      },
    },
  });
  return new Map(routes.map(({ file, path }) => [file, path]));
}

function markdownRoutes(
  files: MarkdownFiles,
  options: MarkdownRouteOptions = {}
): MarkdownRoute[] {
  const routes: MarkdownRoute[] = [];
  // Drop excluded drafts before resolving paths so they cannot collide with
  // published routes.
  const sources = Object.entries(files)
    .map(([file, raw]) => ({
      file,
      frontmatter: parseFrontmatter(raw),
      key: sourceKey(file),
      raw,
    }))
    .filter(({ frontmatter }) => !(frontmatter.draft && options.filterDrafts));
  const paths = routePaths(
    Object.fromEntries(sources.map(({ key, raw }) => [key, raw]))
  );

  for (const { file, frontmatter, key, raw } of sources) {
    const path = paths.get(key);
    if (path === undefined) {
      throw new Error(`No route path was resolved for ${file}.`);
    }
    if (hasDynamicRouteSegments(path)) {
      throw new Error(
        `Markdown routes do not support dynamic segments in ${file}. Use a TSX route when params are needed.`
      );
    }

    routes.push({
      body: frontmatter.body,
      date: frontmatter.date,
      description: frontmatter.description,
      draft: frontmatter.draft,
      path,
      raw,
      title: frontmatter.title || path,
    });
  }

  return routes;
}

export function markdownManifestEntries(
  files: MarkdownFiles,
  options: MarkdownRouteOptions = {}
): MarkdownManifestEntry[] {
  return markdownRoutes(files, options).map(
    ({ date, description, path, title }) => ({
      date,
      description,
      path,
      title,
    })
  );
}

export function createMarkdownRoutes(
  files: MarkdownFiles,
  renderMarkdown: RenderMarkdown,
  options: MarkdownRouteOptions = {}
): Hono {
  const app = new Hono();

  for (const route of markdownRoutes(files, options)) {
    app.get(route.path, async (c) =>
      c.render(await renderMarkdown(route.body), {
        description: route.description,
        title: route.title,
      })
    );
    app.get(toMarkdownPath(route.path), () => markdownResponse(route.raw));
  }

  return app;
}
