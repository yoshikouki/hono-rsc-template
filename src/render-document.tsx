import type { ReactNode } from "react";
import "./globals.css";

export interface SiteConfig {
  name: string;
  baseUrl: string;
  lang?: string; // default "en"
}

export interface DocumentOptions {
  title: string;
  description?: string;
  pathname: string;
  body: ReactNode;
  jsonLd?: unknown[];
  ogImage?: string;
}

export function renderDocument(
  site: SiteConfig,
  {
    title,
    description,
    pathname,
    body,
    jsonLd = [],
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
            dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
            key={i}
            type="application/ld+json"
          />
        ))}
      </head>
      <body className="min-h-screen antialiased">{body}</body>
    </html>
  );
}
