import type { ReactNode } from "react";
import "./globals.css";

export interface JsonLdContext {
  date?: string;
  description?: string;
  pathname: string;
  title: string;
}

export interface SiteConfig {
  baseUrl: string;
  defaultJsonLd?: (context: JsonLdContext) => unknown[];
  lang?: string; // default "en"
  name: string;
}

export interface DocumentOptions {
  body: ReactNode;
  description?: string;
  jsonLd?: unknown[];
  noindex?: boolean;
  ogImage?: string;
  pathname: string;
  title: string;
}

export function renderDocument(
  site: SiteConfig,
  {
    title,
    description,
    pathname,
    body,
    jsonLd = [],
    noindex,
    ogImage,
  }: DocumentOptions
) {
  const lang = site.lang ?? "en";
  const canonical = `${site.baseUrl}${pathname === "/" ? "/" : pathname}`;

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>{title}</title>
        {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}
        {description ? <meta content={description} name="description" /> : null}
        <link href={canonical} rel="canonical" />

        {/* Open Graph */}
        <meta content={title} property="og:title" />
        {description ? (
          <meta content={description} property="og:description" />
        ) : null}
        <meta content={canonical} property="og:url" />
        <meta content="website" property="og:type" />
        <meta content={site.name} property="og:site_name" />
        {ogImage ? <meta content={ogImage} property="og:image" /> : null}

        {/* Tailwind CSS — injected via @vitejs/plugin-rsc loadCss() */}
        {import.meta.viteRsc.loadCss()}
        {jsonLd.map((item, i) => (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires inline script injection
            dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
            // biome-ignore lint/suspicious/noArrayIndexKey: JSON-LD items have no stable identifier
            key={i}
            type="application/ld+json"
          />
        ))}
      </head>
      <body className="min-h-screen antialiased">{body}</body>
    </html>
  );
}
