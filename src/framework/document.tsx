import type { ReactNode } from "react";
import type { SiteConfig } from "./types";

export interface DocumentOptions<TContext = unknown> {
  body: ReactNode;
  context?: TContext;
  description?: string;
  jsonLd?: unknown[];
  noindex?: boolean;
  ogImage?: string;
  pathname: string;
  title: string;
}

export function renderDocument<TContext = unknown>(
  site: SiteConfig<TContext>,
  {
    title,
    description,
    pathname,
    body,
    jsonLd = [],
    ogImage,
    noindex,
    context,
  }: DocumentOptions<TContext>
) {
  const canonical = `${site.baseUrl}${pathname}`;
  const resolvedOgImage = ogImage || site.defaultOgImage;
  const documentTitle = site.formatTitle
    ? site.formatTitle(title, pathname)
    : title;
  const resolvedContext = context as TContext;
  const htmlAttrs = site.htmlAttributes?.(resolvedContext) ?? {};
  const resolvedHead =
    typeof site.head === "function" ? site.head(resolvedContext) : site.head;

  return (
    <html lang={site.lang ?? "ja"} {...htmlAttrs}>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        {site.themeColor ? (
          <meta content={site.themeColor} name="theme-color" />
        ) : null}
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
            // biome-ignore lint/suspicious/noArrayIndexKey: JSON-LD items are static per render and have no stable id
            key={i}
            type="application/ld+json"
          />
        ))}

        {resolvedHead}
      </head>
      <body className={site.bodyClassName}>{body}</body>
    </html>
  );
}
