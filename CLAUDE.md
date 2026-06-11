# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hono + React Server Components (RSC) template running on Cloudflare Workers. Uses `@vitejs/plugin-rsc` for RSC protocol with 3-environment build (RSC/SSR/Client). RSC payload is inlined into HTML via `rsc-html-stream`; no `/__rsc/` path prefix.

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
│   ├── server.ts         # createApp: Hono router assembly + Accept negotiation
│   ├── entry.rsc.tsx     # RSC entry (thin — imports site.tsx)
│   ├── entry.ssr.tsx     # SSR entry (RSC stream tee + injectRSCPayload)
│   └── entry.browser.tsx # Hydrate from inline RSC payload (no extra fetch)
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
- **ssr** (`entry.ssr.tsx`) — RSC → HTML stream conversion + RSC payload inline injection (rsc-html-stream)
- **client** (`entry.browser.tsx`) — Hydration from inline payload (no additional fetch)

### Rendering Pipeline

`route → meta → page ∘ layouts ∘ document → RSC stream → (HTML with inline payload)`

- Same URL: `Accept: text/x-component` → RSC payload; otherwise → HTML (content negotiation, `Vary: Accept`)
- `manifest.ts` is a pure function (no React/Hono deps) and is unit-testable. Hono wiring is in `server.ts`
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

export const meta: RouteMeta = {
  title: "Page Title",
  description: "Description",
};

export default function Page() {
  return <main>Body only. Layout/document shell is automatic.</main>;
}
```

### New Page

Place a file in `src/routes/` — no manual registration needed.

## Key Types (framework/types.ts)

- `RouteMeta` — Page metadata (title, description, date, tags, ogImage, cacheControl, jsonLd, markdown, noindex, draft)
- `RouteModule` — Page module (default component + meta)
- `SiteConfig` — Site-specific config (baseUrl, name, head, formatTitle, renderMarkdown, etc.)
- `AppEnv` — Hono environment variables (markdownSources, routeManifest)

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
