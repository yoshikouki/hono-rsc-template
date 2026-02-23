import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";

// Page route map — add entries here when you create a new page
const pages: Record<
  string,
  () => Promise<{ default: () => React.ReactElement }>
> = {
  "/": () => import("@/pages/home").then((m) => ({ default: m.HomePage })),
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // .rsc suffix: browser re-fetches RSC payload for hydration
  const isRsc = url.pathname.endsWith(".rsc");
  const pathname = isRsc ? url.pathname.slice(0, -4) || "/" : url.pathname;

  const pageLoader = pages[pathname];
  if (pageLoader) {
    const { default: Page } = await pageLoader();
    const rscStream = renderToReadableStream(<Page />);

    if (isRsc) {
      // Return raw RSC payload (React Flight Protocol)
      return new Response(rscStream, {
        headers: { "Content-Type": "text/x-component;charset=utf-8" },
      });
    }

    // SSR: convert RSC stream → HTML
    const ssrEntry = await import.meta.viteRsc.import<
      typeof import("./entry.ssr.tsx")
    >("./entry.ssr.tsx", { environment: "ssr" });
    const htmlStream = await ssrEntry.handleSsr(rscStream);
    return new Response(htmlStream, {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  // No page matched → delegate to Hono (API routes, etc.)
  const ssrEntry = await import.meta.viteRsc.import<
    typeof import("./entry.ssr.tsx")
  >("./entry.ssr.tsx", { environment: "ssr" });
  return ssrEntry.handleHono(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
