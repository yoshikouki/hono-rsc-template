import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

const bootstrapScriptContentPromise =
  import.meta.viteRsc.loadBootstrapScriptContent("index");

export interface RenderHtmlOptions {
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}

export async function renderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options: RenderHtmlOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const root = await createFromReadableStream<ReactNode>(rscStream);
  return renderToReadableStream(root, {
    bootstrapScriptContent: await bootstrapScriptContentPromise,
    signal: options.signal,
    onError: options.onError ?? ((error) => console.error(error)),
  });
}
