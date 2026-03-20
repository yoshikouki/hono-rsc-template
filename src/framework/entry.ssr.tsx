import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import { renderToReadableStream } from "react-dom/server.edge";
import { type HandleSsrOptions, renderSsrRoot } from "./ssr-render";

const bootstrapScriptContentPromise =
  import.meta.viteRsc.loadBootstrapScriptContent("index");

export async function handleSsr(
  rscStream: ReadableStream,
  options: HandleSsrOptions = {}
) {
  const root = await createFromReadableStream(rscStream);
  const bootstrapScriptContent = await bootstrapScriptContentPromise;

  return renderSsrRoot(
    root,
    bootstrapScriptContent,
    renderToReadableStream,
    options
  );
}
