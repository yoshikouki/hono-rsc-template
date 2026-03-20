export interface HandleSsrOptions {
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}

interface SsrRenderStreamOptions {
  bootstrapScriptContent: string;
  onError: (error: unknown) => void;
  signal?: AbortSignal;
}

type RenderSsrStream = <TRoot>(
  root: TRoot,
  options: SsrRenderStreamOptions
) => ReadableStream;

const defaultOnError = (error: unknown): void => {
  console.error(error);
};

export function renderSsrRoot<TRoot>(
  root: TRoot,
  bootstrapScriptContent: string,
  renderToReadableStream: RenderSsrStream,
  options: HandleSsrOptions = {}
): ReadableStream {
  const { signal, onError = defaultOnError } = options;

  return renderToReadableStream(root, {
    bootstrapScriptContent,
    signal,
    onError,
  });
}
