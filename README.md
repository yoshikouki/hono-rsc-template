# hono-rsc-template

A minimal template for running **React Server Components** on **Cloudflare Workers** with **Hono**, powered by [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc).

## Stack

- **React 19** — Server Components + Streaming SSR
- **Hono** — Handles all routing (pages + API)
- **`@vitejs/plugin-rsc`** — RSC protocol implementation (Vite 6 Environment API)
- **`rsc-html-stream`** — Inlines RSC payload into HTML (no separate `/__rsc/` fetch)
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
| `rsc` | RSC rendering + all routing | `src/framework/entry.rsc.tsx` |
| `ssr` | Convert RSC stream → HTML + inject inline RSC payload | `src/framework/entry.ssr.tsx` |
| `client` | Hydration from inline payload | `src/framework/entry.browser.tsx` |

### Request Flow

**Initial page load (HTML)**

```
Browser → GET /
  → entry.rsc.tsx: createApp() → Hono handles route
  → render.tsx: renderRouteToRscStream() → RSC stream
  → entry.ssr.tsx: createFromReadableStream() + renderToReadableStream()
                   + injectRSCPayload() inline into HTML
  → Response: Content-Type: text/html  (RSC payload embedded)
```

**RSC navigation (Accept: text/x-component)**

```
Browser → GET / (Accept: text/x-component)
  → server.ts: acceptsRsc() → returns RSC stream directly
  → Response: Content-Type: text/x-component
```

**Hydration**

```
Browser: rscStream from inline <script> → createFromReadableStream() → hydrateRoot()
```

### Content Negotiation (vs `/__rsc/` path prefix)

Same URL serves both HTML and RSC payload via the `Accept` header:

- `Accept: text/html` (or default) → HTML response with inline RSC payload
- `Accept: text/x-component` → RSC payload stream

This approach eliminates the `/__rsc/` path prefix and uses `Vary: Accept` for correct CDN caching.

## File Structure

```
src/
├── site.tsx              # App-layer config (SiteConfig, routeGlobs, notFound)
├── framework/            # Framework layer — no site-specific knowledge
│   ├── types.ts          # All shared types
│   ├── manifest.ts       # glob → Route[] (pure, testable)
│   ├── content/          # Frontmatter parser, markdown adapter, response helpers
│   ├── document.tsx      # HTML document shell
│   ├── render.tsx        # Layout composition + RSC stream
│   ├── server.ts         # Hono app factory + Accept negotiation
│   ├── entry.rsc.tsx     # RSC env entry
│   ├── entry.ssr.tsx     # SSR env entry
│   └── entry.browser.tsx # Client env entry
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

export const meta: RouteMeta = {
  title: "My Page",
  description: "About my page",
};

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

## Limitations

- **Server Actions** (`"use server"`) are not implemented. Use Hono RPC (`.ts` handler routes) instead.
