import { createElement } from "react";
import { renderMarkdownToReact } from "@/lib/markdown/render";
import "@/globals.css";
import type { RouteGlobs, SiteConfig } from "./framework/types";

export const site: SiteConfig = {
  baseUrl: "https://example.com",
  name: "My App",
  lang: "en",
  bodyClassName: "min-h-screen antialiased",
  renderMarkdown: async (body) => {
    const rendered = await renderMarkdownToReact(body);
    return createElement("article", null, rendered);
  },
  head: (
    <>
      {/* globals.css is imported by this module; loadCss() collects the
          importer's CSS, so it must be called here, not in the framework */}
      {import.meta.viteRsc.loadCss()}
    </>
  ),
};

export const routeGlobs: RouteGlobs = {
  pages: import.meta.glob<import("./framework/types").RouteModule>([
    "./routes/**/*.tsx",
    "!./routes/**/layout.tsx",
  ]),
  layouts: import.meta.glob<import("./framework/types").LayoutModule>(
    "./routes/**/layout.tsx"
  ),
  handlers: import.meta.glob("./routes/**/*.ts", {
    eager: true,
    import: "default",
  }),
  contents: import.meta.glob<string>("./routes/**/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
};

export const notFound: import("./framework/types").RouteLoader = () =>
  import("@/components/not-found") as Promise<
    import("./framework/types").RouteModule
  >;
