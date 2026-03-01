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
     │                            │                        │
     │    app.fetch(request)       │                        │
     │    (Hono with rscMiddleware)│                        │
     │           │                │                        │
     │   ┌───────▼────────┐       │                        │
     │   │ GET /          │       │                        │
     │   │ rscMiddleware  │       │                        │
     │   │ renderPage(    │       │                        │
     │   │   request,     │       │                        │
     │   │   loader,      │       │                        │
     │   │   isRsc=false  │       │                        │
     │   │ )              │       │                        │
     │   └───────┬────────┘       │                        │
     │           │ RSC stream     │                        │
     │           └────────────────► handleSsr()            │
     │                            │ → HTML stream          │
     │                                                     │
     │   ┌───────▼────────┐                               │
     │   │ GET /__rsc/    │                               │
     │   │ rscMiddleware  │                               │
     │   │ renderPage(    │                               │
     │   │   request,     │                               │
     │   │   loader,      │                               │
     │   │   isRsc=true   │                               │
     │   │ )              │                               │
     │   └───────┬────────┘                               │
     │           │ RSC stream → Response                  │
     │                                                     │
     │   ┌───────────────────────────────────────────┐     │
     │   │ GET /api/hello → c.json({...})            │     │
     │   └───────────────────────────────────────────┘     │
```

### Request Flow

**Initial page load (HTML)**

```
Browser → GET /
  → entry.rsc.tsx:  handler → app.fetch()
  → rscMiddleware:  inject renderPage into context
  → GET / handler:  renderPage(request, HomePageLoader, false)
  → renderPage:     renderToReadableStream(<HomePage />) → RSC stream
  → entry.ssr.tsx:  createFromReadableStream() + renderToReadableStream()
  → Response:       Content-Type: text/html
```

**Hydration**

```
Browser → GET /__rsc/  (bootstrapScriptContent triggers this)
  → entry.rsc.tsx:  handler → app.fetch()
  → rscMiddleware:  inject renderPage into context
  → GET /__rsc/ handler: renderPage(request, HomePageLoader, true)
  → renderPage:     return RSC stream directly
  → Response:       Content-Type: text/x-component

Browser: createFromReadableStream(body) → hydrateRoot(document, root)
```

## Why `/__rsc/` path prefix (Design Decision)

RSC requires a way to distinguish "give me HTML" from "give me the RSC payload" for the same URL. Existing frameworks take different approaches:

| Framework | Method | CDN Cache | Spoofing Risk |
|---|---|---|---|
| **Next.js** | `Rsc: 1` request header | Needs `Vary: Rsc` | [Documented risk](https://zhero-web-sec.github.io/research-and-things/nextjs-and-cache-poisoning-a-quest-for-the-black-hole) |
| **Waku** | `/RSC/` path prefix | Separate URLs | None (different path) |
| **This template** | `/__rsc/` path prefix | Separate URLs | None (different path) |

We chose the `/__rsc/` path prefix approach, inspired by [Waku](https://waku.gg/)'s use of `/RSC/`:

- **No spoofing** — RSC and HTML are served from entirely different paths; no header stripping needed
- **Natural CDN cache separation** — different URLs = different cache entries, no `Vary` header required
- **Explicit routing** — `/__rsc/*` routes are registered explicitly in Hono, making the data flow easy to follow
- **isRsc passed by caller** — route handlers decide `isRsc`, not middleware heuristics

## File Structure

```
src/
├── framework/
│   ├── entry.rsc.tsx       # RSC env — rscMiddleware, handler
│   ├── entry.ssr.tsx       # SSR env — RSC stream → HTML
│   └── entry.browser.tsx   # Browser — /__rsc/ fetch + hydrateRoot
├── lib/
│   ├── markdown/           # Markdown → React rendering (frontmatter, components)
│   └── router/             # File-based route resolver & runtime
├── routes/
│   ├── about/              # /about page (index.tsx + layout.tsx)
│   ├── index.tsx           # / (Home page)
│   ├── layout.tsx          # Root layout
│   ├── hello.md            # /hello (Markdown content page)
│   ├── healthz.ts          # /healthz handler
│   └── robots.txt.ts       # /robots.txt handler
├── components/             # Client Components ("use client")
├── render-document.tsx     # HTML document shell (<html>, <head>, <body>)
├── factory.ts              # App types & factory helpers
└── index.ts                # Hono app — createApp(), route registration
```

## Adding a Page

1. Create `src/routes/my-page.tsx` and export a Server Component
2. Register both the HTML route and the RSC payload route in `src/index.tsx`:

```tsx
// HTML route
app.get("/my-page", rscMiddleware, (c) =>
  c.get("renderPage")(
    c.req.raw,
    () => import("@/routes/my-page").then((m) => ({ default: m.MyPage })),
    false
  )
);

// RSC payload route
app.get("/__rsc/my-page", rscMiddleware, (c) =>
  c.get("renderPage")(
    c.req.raw,
    () => import("@/routes/my-page").then((m) => ({ default: m.MyPage })),
    true
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

3. **`refactor: switch from .rsc suffix to /__rsc/ path prefix`** — Current design.  
   RSC requests use `/__rsc/` path prefix (inspired by Waku's `/RSC/`). Separate routes for HTML and RSC payloads; `isRsc` is passed explicitly by the route handler.

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
