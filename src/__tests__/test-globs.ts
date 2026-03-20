import type { RouteGlobs } from "../lib/router/resolver";

// Test replacement for import.meta.glob (which is Vite-only).
export const testGlobs: RouteGlobs = {
  pages: {
    "../routes/index.tsx": await import("../routes/index"),
    "../routes/about/index.tsx": await import("../routes/about/index"),
  },
  layouts: {},
  handlers: {
    "../routes/healthz.ts": (await import("../routes/healthz")).default,
    "../routes/robots.txt.ts": (await import("../routes/robots.txt")).default,
    "../routes/sitemap.xml.ts": (await import("../routes/sitemap.xml")).default,
    "../routes/llms.txt.ts": (await import("../routes/llms.txt")).default,
    "../routes/speculationrules.json.ts": (
      await import("../routes/speculationrules.json")
    ).default,
  },
  contents: {
    "../routes/hello.md": (await import("../routes/hello.md?raw")).default,
  },
};
