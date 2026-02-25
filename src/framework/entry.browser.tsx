import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import { hydrateRoot } from "react-dom/client";

const TRAILING_SLASHES = /\/\/+$/;

function rscUrl() {
  const pathname =
    window.location.pathname.replace(TRAILING_SLASHES, "") || "/";
  return `/__rsc${pathname === "/" ? "/" : pathname}`;
}

async function main() {
  const rscResponse = await fetch(rscUrl());
  if (!rscResponse.body) {
    return;
  }
  const root = await createFromReadableStream(rscResponse.body);
  hydrateRoot(document, root);
}

main();

// HMR: apply RSC updates without full page reload
if (import.meta.hot) {
  import.meta.hot.on("rsc:update", async () => {
    const { createFromFetch } = await import("@vitejs/plugin-rsc/browser");
    await createFromFetch(fetch(rscUrl()));
  });
}
