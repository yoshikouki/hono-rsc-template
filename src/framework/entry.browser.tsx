import { createFromFetch } from "@vitejs/plugin-rsc/browser";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";

function rscUrlFor(url: URL): string {
  const pathname = url.pathname === "/" ? "/__rsc" : `/__rsc${url.pathname}`;
  return `${pathname}${url.search}`;
}

function fetchRsc(url = new URL(window.location.href)) {
  return createFromFetch<ReactNode>(
    fetch(rscUrlFor(url), {
      headers: { accept: "text/x-component" },
    })
  );
}

async function main() {
  const initial = await fetchRsc();
  const root = hydrateRoot(document, initial);

  if (import.meta.hot) {
    import.meta.hot.on("rsc:update", async () => {
      const next = await fetchRsc();
      root.render(next);
    });
  }
}

main();
