import type { ComponentPropsWithoutRef, JSX } from "react";

type Props<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

export const markdownComponents = {
  h1: (props: Props<"h1">) => (
    <h1 className="mb-6 font-bold text-4xl" {...props} />
  ),
  h2: (props: Props<"h2">) => (
    <h2
      className="mt-10 mb-4 border-b pb-2 font-semibold text-2xl"
      {...props}
    />
  ),
  h3: (props: Props<"h3">) => (
    <h3 className="mt-8 mb-3 font-semibold text-xl" {...props} />
  ),
  p: (props: Props<"p">) => <p className="mt-4 leading-7" {...props} />,
  a: (props: Props<"a">) => (
    <a className="underline hover:no-underline" {...props} />
  ),
  ul: (props: Props<"ul">) => (
    <ul className="mt-4 list-disc space-y-1 pl-6" {...props} />
  ),
  ol: (props: Props<"ol">) => (
    <ol className="mt-4 list-decimal space-y-1 pl-6" {...props} />
  ),
  li: (props: Props<"li">) => <li className="leading-7" {...props} />,
  code: (props: Props<"code">) => (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm" {...props} />
  ),
  pre: (props: Props<"pre">) => (
    <pre
      className="mt-4 overflow-x-auto rounded border bg-gray-50 p-4 [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  blockquote: (props: Props<"blockquote">) => (
    <blockquote
      className="mt-4 border-l-4 pl-4 text-gray-600 italic"
      {...props}
    />
  ),
  hr: (props: Props<"hr">) => <hr className="my-8" {...props} />,
};
