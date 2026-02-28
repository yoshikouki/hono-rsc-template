import type { ReactElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeReact from "rehype-react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { markdownComponents } from "./components";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeReact, {
    Fragment,
    jsx,
    jsxs,
    components: markdownComponents,
  });

export const renderMarkdownToReact = async (
  markdown: string
): Promise<ReactElement> => {
  const file = await processor.process(markdown);
  return file.result;
};
