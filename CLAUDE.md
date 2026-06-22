# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hono + React Server Components (RSC) template running on Cloudflare Workers. Uses `@vitejs/plugin-rsc` for RSC protocol with 3-environment build (RSC/SSR/Client). Initial HTML and RSC payloads are separated by URL: page routes return HTML, and `/__rsc/...` routes return RSC payloads.

## Commands

```bash
bun run dev          # Vite dev server with HMR (localhost:5173)
bun run build        # Production build (3-env Vite build + worker entry)
bun run preview      # Wrangler local preview (localhost:8787, NODE_ENV=production)
bun run deploy       # Build + deploy to Cloudflare Workers
bun run check        # Lint/format check (Ultracite/Biome)
bun run fix          # Auto-fix lint/format
bun test             # Run tests (Vitest)
```

## Architecture

```
src/
├── site.tsx              # App-layer config: SiteConfig + routeGlobs + notFound + CSS import
├── framework/            # Framework layer — no site-specific knowledge
│   ├── types.ts          # Single source of types (RouteMeta, RouteModule, Route, SiteConfig, AppEnv, etc.)
│   ├── manifest.ts       # glob → Route[]. Path calculation only. Pure, no React.
│   ├── content/
│   │   ├── frontmatter.ts # Frontmatter parser
│   │   ├── markdown.ts    # raw md → RouteModule adapter
│   │   └── response.ts    # text/markdown response helpers
│   ├── document.tsx      # HTML document shell (SiteConfig-driven)
│   ├── render.tsx        # document ∘ layouts ∘ page composition + RSC stream
│   ├── server.ts         # createApp: Hono router assembly + /__rsc route separation
│   ├── entry.rsc.tsx     # RSC entry (thin — imports site.tsx)
│   ├── entry.ssr.tsx     # SSR entry (RSC stream → initial HTML)
│   └── entry.browser.tsx # Fetch /__rsc payload and hydrate
├── lib/
│   └── markdown/
│       ├── render.ts      # MD → React conversion (remark/rehype)
│       └── components.tsx # Tailwind-styled HTML elements for markdown
├── routes/               # File-based routing (see below)
├── components/           # Shared UI components
└── bindings.ts           # Cloudflare Workers bindings type definitions
```

### RSC 3 Environments

- **rsc** (`entry.rsc.tsx`) — Server Components rendering + page routing
- **ssr** (`entry.ssr.tsx`) — RSC → initial HTML stream conversion
- **client** (`entry.browser.tsx`) — Fetch `/__rsc/...` payload and hydrate

### Rendering Pipeline

`route graph → load page → resolveMeta(request) → page ∘ layouts ∘ document → RSC stream → HTML`

- Page URL: `/about` → HTML. RSC URL: `/__rsc/about` → `text/x-component`.
- RSC responses are `Cache-Control: private, no-store`; route-level `cacheControl` applies to HTML responses only.
- The built-in sitemap handler does not set `Cache-Control` by default.
- Initial HTML and `/__rsc/...` are separate renders. Keep initial client component output deterministic; move browser-time values into effects after hydration.
- `manifest.ts` builds only the route graph (path + loader + layout chain). It must not eager-load page modules for metadata.
- Page metadata is request-time via `resolveMeta()`. Site-index metadata is async via `routeManifest()` and optional page-module `enumerate()`; draft entries are excluded from `routeManifest()` in production.
- Dynamic filename routes such as `[id]` are not implemented yet; leave the WIP marker in `manifest.ts` until the convention is designed.
- **Server Actions are not implemented.** Use Hono RPC (`.ts` handler routes) for API calls.

## Routing Convention

| Extension | Purpose | Example |
|-----------|---------|---------|
| `.tsx` | Page (RSC) | `routes/index.tsx` → `GET /` |
| `.ts` | Hono handler | `routes/robots.txt.ts` → `GET /robots.txt` |
| `.md` | Markdown page | `routes/hello.md` → `GET /hello` |
| `layout.tsx` | Directory layout | `routes/layout.tsx` → root layout |

### Writing a Page

```tsx
import type { RouteMeta } from "@/framework/types";

export const resolveMeta = (): RouteMeta => ({
  title: "Page Title",
  description: "Description",
});

export default function Page() {
  return <main>Body only. Layout/document shell is automatic.</main>;
}
```

### New Page

Place a file in `src/routes/` — no manual registration needed.

## Key Types (framework/types.ts)

- `RouteMeta` — Page metadata (title, description, date, tags, ogImage, cacheControl, jsonLd, markdown, noindex, draft)
- `RouteModule<TContext>` — Page module (default component + required `resolveMeta`, optional `enumerate`). The default export receives `{ context, params }`.
- `PageProps<TContext>` — Props received by page components when `createRequestContext` is used.
- `AppRoute<TContext>` — Programmatic route descriptor `{ path, load }` for DB/CMS-driven pages.
- `SiteConfig<TContext>` — Site-specific config (baseUrl, name, head, formatTitle, renderMarkdown, speculationRulesPath, themeColor, htmlAttributes, etc.)
- `AppEnv` — Hono environment variables (`markdownSources`, `routeManifest()`, `site`)

## Framework Extension Points

### Programmatic Routes (DB/CMS-driven pages)

Pass `routes` to `createApp()` to register pages that don't come from the filesystem:

```tsx
createApp({
  site,
  globs: routeGlobs,
  routes: [
    { path: "/books/123", load: () => import("./BookPage") },
  ],
});
```

The loaded module must export `resolveMeta`. These routes are included in async `routeManifest()` (→ sitemap) and get the root layout chain automatically.

### createRequestContext (request-dependent rendering)

Supply a factory to thread per-request data through to pages and layouts via `props.context`:

```tsx
createApp({
  site,
  globs: routeGlobs,
  createRequestContext: async (req) => {
    const user = await getUser(req.headers.get("Cookie") ?? "");
    return { user };
  },
});
```

Pages and layouts receive `context` as a prop:

```tsx
export default function Page({ context }: PageProps<{ user: string }>) {
  return <main>Hello {context.user}</main>;
}
```

### c.var.site + manifest-driven handlers

Every handler route can read `c.var.site`, `await c.var.routeManifest()`, and `c.var.markdownSources` via the Hono context. The sitemap handler is a built-in example:

```ts
// src/routes/sitemap.xml.ts
import { createSitemapApp } from "@/framework/handlers/sitemap";
export default createSitemapApp();
```

`createSitemapApp` accepts an optional `{ filter }` to exclude entries.

## Important Technical Notes

1. `import.meta.viteRsc.import()` / `loadCss()` / `loadBootstrapScriptContent()` are **build-time static transform macros**. Write them in the exact `import.meta.viteRsc.xxx(...)` syntax. Casts or optional chains will break the transformation.
2. `loadCss()` collects CSS imports from the calling module. **Call it inside `site.tsx`** where `globals.css` is imported (not in `framework/document.tsx`).
3. `wrangler dev` defines `NODE_ENV=development`, causing server/client React mismatch and hydration issues. The `preview` script sets `NODE_ENV=production` to fix this.

## Code Quality

- Biome via Ultracite (indent: space, quote: double, import sort, Tailwind class sort)
- Husky pre-commit: format + vitest run
- **Do not commit code that fails lint.**

## Conventions

- **React 19** with React Compiler (babel-plugin-react-compiler)
- **TypeScript strict mode** with `@cloudflare/workers-types`
- Pages are Server Components by default; use `"use client"` directive only when needed
- Cloudflare Workers env accessed via Hono context: `c.env.GREETING`, `c.env.MY_KV`, etc.
- Server Actions (`"use server"`) are not implemented
