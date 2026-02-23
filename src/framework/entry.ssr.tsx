import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import { renderToReadableStream } from "react-dom/server.edge";
import app from "@/index";

const bootstrapScriptContentPromise =
  import.meta.viteRsc.loadBootstrapScriptContent("index");

// RSC stream → HTML stream
export async function handleSsr(rscStream: ReadableStream) {
  const root = await createFromReadableStream(rscStream);
  const bootstrapScriptContent = await bootstrapScriptContentPromise;
  return renderToReadableStream(root, { bootstrapScriptContent });
}

// Hono handles API routes and anything not covered by RSC pages
export function handleHono(request: Request): Response | Promise<Response> {
  return app.fetch(request);
}
