const MARKDOWN_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

const estimateTokens = (content: string): string =>
  Math.max(1, Math.ceil(content.length / 4)).toString();

export const markdownResponse = (content: string): Response =>
  new Response(content, {
    status: 200,
    headers: {
      "Cache-Control": MARKDOWN_CACHE_CONTROL,
      "Content-Signal": "search=yes ai-input=yes",
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Markdown-Tokens": estimateTokens(content),
    },
  });
