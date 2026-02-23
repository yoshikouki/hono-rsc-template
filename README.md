# hono-rsc-template

A minimal template for running **React Server Components** on **Cloudflare Workers** with **Hono**, powered by [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc).

> **Related article:** [Zenn - Hono × RSC on Cloudflare Workers](#) *(coming soon)*

## Stack

- **React 19** — Server Components + Streaming SSR
- **Hono** — API routes and middleware
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

## How It Works

`@vitejs/plugin-rsc` manages three separate build environments:

| Environment | Role | Runtime |
|---|---|---|
| `rsc` | Render Server Components | Cloudflare Workers (workerd) |
| `ssr` | Convert RSC stream → HTML, run Hono | Node.js (dev) / Workers (prod) |
| `client` | Hydration in the browser | Browser |

### Request Flow

**Initial page load (HTML)**

```
Browser → GET /
  → entry.rsc.tsx:  pages["/"] matched
  → renderToReadableStream(<HomePage />) → RSC stream (React Flight Protocol)
  → entry.ssr.tsx:  createFromReadableStream() → React tree
  → renderToReadableStream(root)         → HTML stream
  → Response: Content-Type: text/html
```

**Hydration (after HTML is displayed)**

```
Browser → GET /.rsc   (triggered by bootstrapScriptContent)
  → entry.rsc.tsx:  isRsc = true, same page loaded
  → renderToReadableStream(<HomePage />) → RSC stream
  → Response: Content-Type: text/x-component
  
Browser: createFromReadableStream(body) → hydrateRoot(document, root)
```

**API request**

```
Browser → GET /api/hello
  → entry.rsc.tsx:  no page matched
  → entry.ssr.tsx:  handleHono(request) → app.fetch(request)
  → Hono router:    GET /api/hello handler
  → Response: application/json
```

## File Structure

```
src/
├── framework/
│   ├── entry.rsc.tsx     # RSC environment entry — page routing + RSC rendering
│   ├── entry.ssr.tsx     # SSR environment — RSC→HTML + Hono delegation
│   └── entry.browser.tsx # Browser — hydration + HMR
├── pages/
│   └── home.tsx          # Example Server Component page
└── index.tsx             # Hono app (API routes)
```

## Adding a Page

1. Create `src/pages/my-page.tsx` and export a Server Component
2. Add an entry in `entry.rsc.tsx`:

```tsx
const pages = {
  "/my-page": () =>
    import("@/pages/my-page").then((m) => ({ default: m.MyPage })),
};
```

## Adding an API Route

Edit `src/index.tsx`:

```tsx
app.get("/api/my-endpoint", (c) => c.json({ data: "..." }));
```

## Known Limitations

- **Cloudflare bindings** (KV, D1, R2): `env` is not yet threaded through to the Hono app
- **File-based routing**: Pages are manually registered in `entry.rsc.tsx`
