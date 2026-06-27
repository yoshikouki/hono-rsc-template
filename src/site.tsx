import type { JSX, ReactElement, ReactNode } from "react";
import { AppLayout } from "@/components/app-layout";
import { renderMarkdownToReact } from "@/lib/markdown/render";
import {
  type MarkdownFiles,
  markdownManifestEntries,
} from "@/lib/markdown/routes";
import "@/globals.css";

interface JsonLdContext {
  date?: string;
  description?: string;
  pathname: string;
  title: string;
}

export interface SiteConfig {
  baseUrl: string;
  bodyClassName?: string;
  defaultJsonLd?: (context: JsonLdContext) => unknown[];
  defaultOgImage?: string;
  formatTitle?: (title: string, pathname: string) => string;
  head?: ReactNode;
  htmlAttributes?: () => JSX.IntrinsicElements["html"];
  keywords?: string;
  lang?: string;
  name: string;
  ogLocale?: string;
  renderMarkdown: (body: string) => Promise<ReactElement>;
  speculationRulesPath?: string;
  themeColor?: string;
  twitterCreator?: string;
  twitterSite?: string;
}

export interface SiteManifestEntry {
  date?: string;
  description?: string;
  path: string;
  title: string;
}

export const markdownFiles = import.meta.glob<string>("./**/*.md", {
  base: "./routes",
  eager: true,
  query: "?raw",
  import: "default",
}) as MarkdownFiles;

function loadSiteCss(): ReactNode {
  if (import.meta.env.MODE === "test") {
    return null;
  }
  return import.meta.viteRsc.loadCss();
}

export const site: SiteConfig = {
  baseUrl: "https://example.com",
  name: "My App",
  lang: "en",
  bodyClassName: "min-h-screen antialiased",
  renderMarkdown: async (body) => {
    const rendered = await renderMarkdownToReact(body);
    return (
      <AppLayout>
        <article>{rendered}</article>
      </AppLayout>
    );
  },
  head: (
    <>
      {/* globals.css is imported by this module; loadCss() collects the
          importer's CSS, so it must be called from this app module. */}
      {loadSiteCss()}
    </>
  ),
};

export const siteManifest: SiteManifestEntry[] = [
  {
    path: "/",
    title: "Home",
    description: "A Hono RSC template app",
  },
  {
    path: "/about",
    title: "About",
    description: "About this template",
  },
  {
    path: "/posts",
    title: "Posts",
    description: "Nested dynamic post routes",
  },
  ...markdownManifestEntries(markdownFiles, {
    filterDrafts: import.meta.env.PROD,
  }),
];
