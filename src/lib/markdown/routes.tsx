import {
  hasDynamicRouteSegments,
  routeFileToManifestPath,
} from "@yoshikouki/hono-file-router";
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

const RE_ROUTE_PREFIX = /^(?:\.\/)?routes\//;

export function toMarkdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

function sourceKey(file: string): string {
  return file.replace(RE_ROUTE_PREFIX, "");
}

function markdownRoutes(
  files: MarkdownFiles,
  options: MarkdownRouteOptions = {}
): MarkdownRoute[] {
  const routes: MarkdownRoute[] = [];

  for (const [file, raw] of Object.entries(files)) {
    const path = routeFileToManifestPath(sourceKey(file)).path;
    if (hasDynamicRouteSegments(path)) {
      throw new Error(
        `Markdown routes do not support dynamic segments in ${file}. Use a TSX route when params are needed.`
      );
    }

    const frontmatter = parseFrontmatter(raw);
    if (frontmatter.draft && options.filterDrafts) {
      continue;
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
