# hono-rsc-template

A minimal template for running **React Server Components** on **Cloudflare Workers** with **Hono**, powered by [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc).

## Stack

- **React 19** — Server Components + Streaming SSR
- **Hono** — Route modules are plain Hono apps
- **`@vitejs/plugin-rsc`** — RSC protocol implementation
- **`@yoshikouki/hono-file-router`** — Mounts file-based Hono route modules
- **`@yoshikouki/hono-rsc-renderer`** — Provides `c.render()`, browser entry, and SSR entry
- **Same-path Flight** — HTML and RSC payloads share URLs and vary by `RSC` / `Accept`
- **Cloudflare Workers** — Edge runtime

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
| `rsc` | RSC rendering + routing | `src/index.tsx` |
| `ssr` | Convert RSC stream to initial HTML | `@yoshikouki/hono-rsc-renderer/entry.ssr` |
| `client` | Fetch same-path Flight and hydrate | `@yoshikouki/hono-rsc-renderer/entry.browser` |

Initial page loads and Flight requests hit the same route:

```txt
GET /about
  -> src/index.tsx
  -> @yoshikouki/hono-file-router mounts src/routes/about/index.tsx
  -> route calls c.render(<Page />, { title, description })
  -> @yoshikouki/hono-rsc-renderer returns HTML or Flight
```

Requests with `RSC: 1` or `Accept: text/x-component` return `text/x-component` with `Cache-Control: private, no-store`. Normal browser requests return `text/html`. Both response shapes set `Vary: RSC, Accept`.

## File Structure

```txt
src/
├── index.tsx             # RSC env entry and Hono app composition
├── site.tsx              # Site config, Markdown files, static site manifest
├── components/           # Shared React components and document shell
├── lib/
│   └── markdown/         # Frontmatter, raw Markdown responses, Markdown routes
├── routes/               # File-based Hono route modules
│   ├── index.tsx         # /
│   ├── about/index.tsx   # /about
│   ├── hello.md          # /hello and /hello.md
│   ├── healthz.ts        # /healthz
│   ├── robots.txt.ts     # /robots.txt
│   ├── sitemap.xml.ts    # /sitemap.xml
│   ├── llms.txt.ts       # /llms.txt
│   └── speculationrules.json.ts
└── bindings.ts           # Cloudflare bindings type definitions
```

## Adding a Page

Create a Hono route module under `src/routes`:

```tsx
import { Hono } from "hono";
import { AppLayout } from "@/components/app-layout";

function MyPage() {
  return <main>Hello from My Page</main>;
}

const app = new Hono();

app.get("/", (c) =>
  c.render(
    <AppLayout>
      <MyPage />
    </AppLayout>,
    {
      title: "My Page",
      description: "About my page",
    }
  )
);

export default app;
```

`src/routes/my-page.tsx` becomes `/my-page`. `src/routes/posts/[id].tsx` becomes `/posts/:id`, and params are available through `c.req.param()`.

## Layout And Metadata

Layouts are ordinary React components in `src/components` or feature folders. Import them from route modules and compose them explicitly.

Document metadata is passed through `c.render()` props. `src/index.tsx` wraps rendered content with `src/components/document.tsx`, which reads props such as `title`, `description`, `noindex`, `ogImage`, and `jsonLd`.

## Markdown

Markdown content lives in `src/routes/**/*.md`. The template turns each Markdown file into:

- `/hello` — rendered through RSC
- `/hello.md` — raw Markdown with `text/markdown`

Markdown helpers are intentionally under `src/lib/markdown`, not a framework layer. Frontmatter currently supports `title`, `description`, `date`, `draft`, and comma-separated `tags`.

## Site Index Endpoints

`src/site.tsx` exports `siteManifest`, an explicit list used by `sitemap.xml.ts` and `llms.txt.ts`. Static route entries are written directly there, and Markdown entries are derived from frontmatter.

For database or CMS routes, add normal Hono handlers and update the relevant site-index endpoint or manifest source in application code.

## Using Cloudflare Bindings

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

3. Use it through `c.env` in any Hono route handler.

## Limitations

- Server Actions (`"use server"`) are not implemented. Use Hono handlers instead.
- Initial hydration performs a follow-up same-path Flight request instead of using an inline RSC payload.
- Initial HTML and Flight are separate renders. Keep initial client component output deterministic, and move browser-time values such as clocks into effects after hydration.
