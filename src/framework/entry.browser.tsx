import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

async function main() {
  const initial = await createFromReadableStream<ReactNode>(rscStream);
  const root = hydrateRoot(document, initial);

  if (import.meta.hot) {
    import.meta.hot.on("rsc:update", async () => {
      const { createFromFetch } = await import("@vitejs/plugin-rsc/browser");
      const next = await createFromFetch<ReactNode>(
        fetch(window.location.href, {
          headers: { accept: "text/x-component" },
        })
      );
      root.render(next);
    });
  }
}

main();
