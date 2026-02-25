# hono-rsc-template

A minimal template for running **React Server Components** on **Cloudflare Workers** with **Hono**, powered by [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc).

> **Related article:** [Zenn - Hono × RSC on Cloudflare Workers](#) *(coming soon)*

## Stack

- **React 19** — Server Components + Streaming SSR
- **Hono** — Handles all routing (pages + API)
- **`@vitejs/plugin-rsc`** — RSC protocol implementation (Vite 6 Environment API)
- **Cloudflare Workers** — edge runtime

## Get Started

```bash
bun install
bun run dev      # start dev server (Vite + HMR)
bun run build    # production build
bun run preview  # wrangler dev --local
bun run deploy   # deploy to Cloudflare Workers
```

## Architecture

`@vitejs/plugin-rsc` manages three separate build environments:

| Environment | Role | Runtime |
|---|---|---|
| `rsc` | RSC rendering + all routing | Cloudflare Workers (workerd) |
| `ssr` | Convert RSC stream → HTML | Node.js (dev) / Workers (prod) |
| `client` | Hydration | Browser |

### Design: Hono Routes Everything

RSC is implemented as a **Hono middleware** (`rscMiddleware`).  
This means all routing — pages and API — lives in one Hono app.

```
entry.rsc.tsx               entry.ssr.tsx           entry.browser.tsx
     │                            │                        │
     │  handler(request)          │                        │
     │  ┌─────────────────┐       │                        │
     │  │ ?__rsc=1?       │       │                        │
     │  │ → set header    │       │                        │
     │  │   X-RSC-Request │       │                        │
     │  └────────┬────────┘       │                        │
     │           │                │                        │
     │    app.fetch(request)       │                        │
     │    (Hono with rscMiddleware)│                        │
     │           │                │                        │
     │   ┌───────▼────────┐       │                        │
     │   │ rscMiddleware  │       │                        │
     │   │ injects        │       │                        │
     │   │ renderPage()   │       │                        │
     │   └───────┬────────┘       │                        │
     │           │                │                        │
     │   ┌───────▼────────┐       │                        │
     │   │ GET /          │       │                        │
     │   │ renderPage(    │       │                        │
     │   │   request,     │       │                        │
     │   │   loader       │       │                        │
     │   │ )              │       │                        │
     │   └───────┬────────┘       │                        │
     │           │ RSC stream     │                        │
     │           └────────────────► handleSsr()            │
     │                            │ → HTML stream          │
     │                                                     │
     │   ┌───────────────────────────────────────────┐     │
     │   │ GET /api/hello → c.json({...})            │     │
     │   └───────────────────────────────────────────┘     │
```

### Request Flow

**Initial page load (HTML)**

```
Browser → GET /
  → entry.rsc.tsx:  sanitizeRscHeader, app.fetch()
  → rscMiddleware:  isRsc=false, inject renderPage into context
  → GET / handler:  renderPage(request, HomePageLoader)
  → renderPage:     renderToReadableStream(<HomePage />) → RSC stream
  → entry.ssr.tsx:  createFromReadableStream() + renderToReadableStream()
  → Response:       Content-Type: text/html, Vary: X-RSC-Request
```

**Hydration**

```
Browser → GET /?__rsc=1  (bootstrapScriptContent triggers this)
  → entry.rsc.tsx:  ?__rsc=1 → set X-RSC-Request: 1 header
  → rscMiddleware:  isRsc=true
  → GET / handler:  renderPage(request, HomePageLoader)
  → renderPage:     return RSC stream directly
  → Response:       Content-Type: text/x-component, Vary: X-RSC-Request

Browser: createFromReadableStream(body) → hydrateRoot(document, root)
```

## Why `?__rsc=1` (Design Decision)

RSC requires a way to distinguish "give me HTML" from "give me the RSC payload" for the same URL. Existing frameworks take different approaches:

| Framework | Method | CDN Cache | Spoofing Risk |
|---|---|---|---|
| **Next.js** | `Rsc: 1` request header | Needs `Vary: Rsc` | [Documented risk](https://zhero-web-sec.github.io/research-and-things/nextjs-and-cache-poisoning-a-quest-for-the-black-hole) |
| **Waku** | `/RSC/` path prefix | Separate URLs | None (different path) |
| **This template** | `?__rsc=1` search param | Separate URLs | Header sanitized at entry |

We chose `?__rsc=1` because:
- **No URL rewriting** — Hono routes the same path for both HTML and RSC requests
- **Natural CDN cache separation** — different URLs = different cache entries
- **No spoofing** — external `X-RSC-Request` headers are stripped by `sanitizeRscHeader`; only the internal `?__rsc=1` → header conversion is trusted

## File Structure

```
src/
├── framework/
│   ├── entry.rsc.tsx     # RSC env — rscMiddleware, handler, sanitizeRscHeader
│   ├── entry.ssr.tsx     # SSR env — RSC stream → HTML
│   └── entry.browser.tsx # Browser — ?__rsc=1 fetch + hydrateRoot
├── pages/
│   └── home.tsx          # Example Server Component
└── index.tsx             # Hono app — createApp(), page routes, API routes
```

## Adding a Page

1. Create `src/pages/my-page.tsx` and export a Server Component
2. Register it in `src/index.tsx`:

```tsx
app.get("/my-page", (c) =>
  c.get("renderPage")(
    c.req.raw,
    () => import("@/pages/my-page").then((m) => ({ default: m.MyPage }))
  )
);
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

3. Use it in any Hono route via `c.env`:

```ts
app.get("/api/data", async (c) => {
  const value = await c.env.MY_KV.get("my-key");
  return c.json({ value });
});
```

`env` is passed from the Workers runtime through `handler(request, env)` → `app.fetch(request, env)`, so all routes have full access.

## Commit History

This repo's commit history shows the evolution:

1. **`init: naive plugin-rsc + Hono fallback`** — The simplest working setup.  
   `pages` object in `entry.rsc.tsx`, Hono only for unmatched routes.

2. **`refactor: integrate RSC as Hono middleware`** — Hono handles all routing. RSC rendering via `rscMiddleware` + `renderPage` context.

3. **`refactor: switch from .rsc suffix to ?__rsc=1 search param`** — Current design.  
   RSC requests use `?__rsc=1` query param. No URL rewriting needed; Hono routes the same path for both HTML and RSC.

## ⚠️ Scope: What This Template Does NOT Cover

`@vitejs/plugin-rsc` is a **low-level RSC protocol implementation**, not a full RSC framework.
This template covers the basics — Server Components + Streaming SSR — but the following are **not implemented**:

| Feature | Status | Alternative |
|---|---|---|
| **Server Actions** (`"use server"`) | ❌ Not supported | Waku, Next.js |
| **Client Components** (`"use client"`) | ✅ Works automatically | — |
| **File-based routing + auto layout nesting** | ❌ Manual registration | Next.js, Waku |
| **Cloudflare bindings** (KV, D1, R2) | ✅ Available via `c.env` | — |

If you need Server Actions or a full RSC feature set, consider:
- **[Waku](https://waku.gg/)** — Minimal RSC framework with full feature support
- **[Next.js](https://nextjs.org/)** — Production-grade RSC framework

This template is for those who want **RSC rendering + Hono API on Workers**, with full control over the stack and minimal abstractions.
