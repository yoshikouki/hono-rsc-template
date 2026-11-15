import "@yoshikouki/hono-rsc-renderer";

declare module "@yoshikouki/hono-rsc-renderer" {
  interface RscRenderProps {
    description?: string;
    jsonLd?: unknown[];
    noindex?: boolean;
    ogImage?: string;
    title?: string;
  }
}
