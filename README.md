# hono-rsc-template

A minimal template for running **React Server Components** on **Cloudflare Workers** with **Hono**, powered by [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc).

## Stack

- **React 19** — Server Components + Streaming SSR
- **Hono** — Handles all routing (pages + API)
- **`@vitejs/plugin-rsc`** — RSC protocol implementation
- **`@yoshikouki/hono-file-router`** — File route manifesting and Hono mounting
- **`@yoshikouki/hono-rsc-renderer`** — Browser and SSR RSC runtime entries
- **Same-path Flight** — HTML and RSC payloads share URLs and vary by `RSC` / `Accept`
- **Cloudflare Workers** — edge runtime

## Get Started

```bash
bun install
bun run dev      # start dev server (Vite + HMR)
bun run build    # production build
bun run preview  # NODE_ENV=production wrangler dev --local
bun run deploy   # deploy to Cloudflare Workers
```

## Architecture

`@vitejs/plugin-rsc` manages three separate build environments:

| Environment | Role | Entry |
|---|---|---|
| `rsc` | RSC rendering + all routing | `src/index.tsx` |
| `ssr` | Convert RSC stream → initial HTML | `@yoshikouki/hono-rsc-renderer/entry.ssr` |
| `client` | Fetch same-path Flight and hydrate | `@yoshikouki/hono-rsc-renderer/entry.browser` |

### Request Flow

**Initial page load (HTML)**

```
Browser → GET /
  → src/index.tsx: createApp() → Hono handles route
  → render.tsx: renderRouteToRscStream() → RSC stream
  → @yoshikouki/hono-rsc-renderer/entry.ssr
  → Response: Content-Type: text/html
```

**Hydration payload**

```
Browser → GET /
  headers: RSC: 1, Accept: text/x-component
  → server.ts: same route → returns RSC stream directly
  → Response: Content-Type: text/x-component
```

**Hydration**

```
Browser: @yoshikouki/hono-rsc-renderer/entry.browser → hydrateRoot()
```

### RSC Payload Routing

HTML and RSC payloads use the same URL:

- `/about` → HTML response for the initial render
- `/about` with `RSC: 1` and `Accept: text/x-component` → RSC payload used for hydration and RSC refreshes

Responses set `Vary: RSC, Accept` because the same path can return either HTML or Flight. RSC responses are returned with `Cache-Control: private, no-store`; route-level `cacheControl` applies to HTML responses only.

## File Structure

```
src/
├── site.tsx              # App-layer config (SiteConfig, routeGlobs, notFound)
├── index.tsx             # RSC env entry
├── framework/            # Framework layer — no site-specific knowledge
│   ├── types.ts          # All shared types
│   ├── manifest.ts       # Template route helpers
│   ├── content/          # Frontmatter parser, markdown adapter, response helpers
│   ├── document.tsx      # HTML document shell
│   ├── render.tsx        # Layout composition + RSC stream
│   └── server.ts         # Hono app factory + same-path Flight handling
├── lib/
│   └── markdown/         # MD → React rendering (remark/rehype + Tailwind components)
├── routes/               # File-based routing
│   ├── index.tsx         # / (Home page)
│   ├── layout.tsx        # Root layout
│   ├── hello.md          # /hello (Markdown page)
│   ├── about/            # /about (page + layout)
│   ├── healthz.ts        # /healthz handler
│   ├── robots.txt.ts     # /robots.txt
│   ├── sitemap.xml.ts    # /sitemap.xml
│   ├── llms.txt.ts       # /llms.txt
│   └── speculationrules.json.ts
├── components/           # Client Components ("use client")
└── bindings.ts           # Cloudflare bindings type definitions
```

## Adding a Page

Create `src/routes/my-page.tsx`:

```tsx
import type { RouteMeta } from "@/framework/types";

export const resolveMeta = (): RouteMeta => ({
  title: "My Page",
  description: "About my page",
});

export default function MyPage() {
  return <main>Hello from My Page</main>;
}
```

That's it. No manual registration required.

## Customizing the Site

Edit `src/site.tsx` to configure your site:

```tsx
export const site: SiteConfig = {
  baseUrl: "https://your-domain.com",
  name: "Your Site Name",
  lang: "en",
  // optional: formatTitle, defaultJsonLd, head, etc.
};
```

## Using Cloudflare Bindings (KV, D1, R2)

1. Declare the binding in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MY_KV"
id = "..."
```

2. Add the type in `src/bindings.ts`:

```ts
export interface Env {
  MY_KV: KVNamespace;
}
```

3. Use it via `c.env` in any Hono route handler.

## Framework Extension Points

### Programmatic Routes (DB/CMS-driven pages)

Pages that don't come from the filesystem — e.g. items fetched from a database or CMS — can be supplied as `AppRoute[]` to `createApp()`:

```tsx
createApp({
  site,
  globs: routeGlobs,
  routes: [
    { path: "/books/123", load: () => import("./BookPage") },
  ],
});
```

The loaded page module must export `resolveMeta`. Programmatic routes appear in `routeManifest()` (used by the sitemap handler), inherit the root layout chain, and support `.md` auto-generation through `resolveMeta().markdown`.

### Request-time metadata

Page metadata is resolved when a page or site-index handler needs it, not during route graph construction:

```tsx
import type { RouteContext, RouteMeta } from "@/framework/types";

export async function resolveMeta(
  _ctx: RouteContext
): Promise<RouteMeta> {
  return {
    title: "Book 123",
    description: "Loaded at request time",
    cacheControl: "public, max-age=60",
  };
}
```

For site-index endpoints such as sitemap or `llms.txt`, dynamic lists can be supplied by `enumerate()`:

```tsx
import type { RouteManifestEntry } from "@/framework/types";

export async function enumerate(): Promise<RouteManifestEntry[]> {
  return [
    { path: "/books/123", title: "Book 123" },
    { path: "/books/draft", title: "Draft Book", draft: true },
  ];
}
```

Draft entries returned from `enumerate()` are excluded from `routeManifest()` in production.

Filename routes support single dynamic segments using Next.js-style brackets:

```txt
src/routes/books/[id]/index.tsx -> /books/:id
src/routes/books/[id]/reviews/[reviewId].tsx -> /books/:id/reviews/:reviewId
src/routes/docs/[...slug].tsx -> /docs/:slug{.+}
```

Dynamic params are available from both `PageProps.params` and `RouteContext.params`.
Markdown content routes are static-only; dynamic Markdown files such as `src/routes/blog/[slug].md` fail during manifest construction.
Dynamic page routes should use `.tsx` pages or programmatic routes.
Generated `.md` endpoints are available only for static page-like routes, so a dynamic route such as `/books/:id` does not generate `/books/foo.md`.
Optional segments such as `[[slug]]` are intentionally unsupported and fail during manifest construction.
Dynamic routes without `enumerate()` are excluded from `routeManifest()` because there is no concrete URL to publish in sitemap-like endpoints.

### createRequestContext (per-request data)

Thread request-derived data (auth, cookies, locale, …) through to every page and layout via `props.context`:

```tsx
// src/site.tsx — add createRequestContext to createApp call in src/index.tsx
export function createRequestContext(req: Request) {
  return { user: parseUserFromCookie(req.headers.get("Cookie") ?? "") };
}
```

```tsx
// a page
export default function Page({ context }: PageProps<{ user: string }>) {
  return <main>Hello {context.user}</main>;
}
```

### c.var.site + manifest-driven handlers

Every Hono handler route automatically has access to `c.var.site` (the `SiteConfig`), `c.var.routeManifest()` and `c.var.markdownSources`. The built-in sitemap helper demonstrates this pattern:

```ts
// src/routes/sitemap.xml.ts
import { createSitemapApp } from "@/framework/handlers/sitemap";
export default createSitemapApp();
// optional: createSitemapApp({ filter: (e) => !e.path.startsWith("/draft") })
```

The built-in sitemap handler does not set `Cache-Control` by default.

### SiteConfig: speculationRulesPath, themeColor, htmlAttributes

```tsx
export const site: SiteConfig = {
  // Adds Speculation-Rules header to every HTML response
  speculationRulesPath: "/speculationrules.json",
  // Adds <meta name="theme-color">
  themeColor: "#000000",
  // Adds attributes to <html> (e.g. dark-mode class)
  htmlAttributes: (ctx) => ({ "data-theme": ctx.theme }),
  // head can also be a function for per-request rendering
  head: (ctx) => <link rel="alternate" hrefLang={ctx.lang} href="..." />,
};
```

## Limitations

- **Server Actions** (`"use server"`) are not implemented. Use Hono RPC (`.ts` handler routes) instead.
- Initial hydration performs a follow-up same-path Flight request instead of using an inline RSC payload.
- Initial HTML and Flight are separate renders. Keep initial client component output deterministic, and move browser-time values such as clocks into effects after hydration.
