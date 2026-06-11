import type { ReactElement } from "react";
import { parseFrontmatter } from "./frontmatter";

export type MarkdownAdapter = (
  raw: string,
  path: string
) => {
  load: () => Promise<import("../types").RouteModule>;
  meta: import("../types").RouteMeta;
};

export function createMarkdownAdapter(
  renderMarkdown: (body: string) => Promise<ReactElement>
): MarkdownAdapter {
  return (raw: string, path: string) => {
    const fm = parseFrontmatter(raw);
    const meta: import("../types").RouteMeta = {
      title: fm.title || path,
      description: fm.description,
      date: fm.date,
      draft: fm.draft,
      tags: fm.tags,
      markdown: () => raw,
    };

    const load = async (): Promise<import("../types").RouteModule> => ({
      default: () => renderMarkdown(fm.body),
      meta,
    });

    return { meta, load };
  };
}
