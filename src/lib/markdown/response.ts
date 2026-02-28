const MARKDOWN_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

interface MarkdownResponseOptions {
  varyAccept?: boolean;
}

const estimateTokens = (content: string): string => {
  return Math.max(1, Math.ceil(content.length / 4)).toString();
};

export const markdownResponse = (
  content: string,
  options: MarkdownResponseOptions = {}
): Response => {
  const headers = new Headers({
    "Cache-Control": MARKDOWN_CACHE_CONTROL,
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Markdown-Tokens": estimateTokens(content),
  });

  if (options.varyAccept) {
    headers.set("Vary", "Accept");
  }

  return new Response(content, {
    status: 200,
    headers,
  });
};
