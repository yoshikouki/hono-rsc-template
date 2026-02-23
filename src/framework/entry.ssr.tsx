import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import { renderToReadableStream } from "react-dom/server.edge";

// Cache bootstrap script lookup across requests (it's the same for all pages)
const bootstrapScriptContentPromise =
  import.meta.viteRsc.loadBootstrapScriptContent("index");

interface HandleSsrOptions {
  signal?: AbortSignal;
}

// RSC stream → HTML stream
export async function handleSsr(
  rscStream: ReadableStream,
  options: HandleSsrOptions = {}
) {
  const root = await createFromReadableStream(rscStream);
  const bootstrapScriptContent = await bootstrapScriptContentPromise;
  return renderToReadableStream(root, {
    bootstrapScriptContent,
    signal: options.signal,
  });
}
