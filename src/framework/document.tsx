import type { ReactNode } from "react";
import type { SiteConfig } from "./types";

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
    ogImage,
    noindex,
  }: DocumentOptions
) {
  const canonical = `${site.baseUrl}${pathname}`;
  const resolvedOgImage = ogImage || site.defaultOgImage;
  const documentTitle = site.formatTitle
    ? site.formatTitle(title, pathname)
    : title;

  return (
    <html lang={site.lang ?? "ja"}>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="#000000" name="theme-color" />
        <title>{documentTitle}</title>
        {description ? <meta content={description} name="description" /> : null}
        {site.keywords ? (
          <meta content={site.keywords} name="keywords" />
        ) : null}
        <link href={canonical} rel="canonical" />
        {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}

        {/* Open Graph */}
        <meta content={title} property="og:title" />
        {description ? (
          <meta content={description} property="og:description" />
        ) : null}
        <meta content={canonical} property="og:url" />
        <meta content="website" property="og:type" />
        {site.ogLocale ? (
          <meta content={site.ogLocale} property="og:locale" />
        ) : null}
        <meta content={site.name} property="og:site_name" />
        {resolvedOgImage ? (
          <meta content={resolvedOgImage} property="og:image" />
        ) : null}

        {/* Twitter */}
        {site.twitterSite || site.twitterCreator ? (
          <meta content="summary_large_image" name="twitter:card" />
        ) : null}
        {site.twitterSite ? (
          <meta content={site.twitterSite} name="twitter:site" />
        ) : null}
        {site.twitterCreator ? (
          <meta content={site.twitterCreator} name="twitter:creator" />
        ) : null}

        {jsonLd.map((item, i) => (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires inline script injection
            dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
            // biome-ignore lint/suspicious/noArrayIndexKey: JSON-LD items have no stable identifier
            key={i}
            type="application/ld+json"
          />
        ))}

        {site.head}
      </head>
      <body className={site.bodyClassName}>{body}</body>
    </html>
  );
}
