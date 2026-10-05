"use client";

import ReactMarkdown, { type Options } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { normalizeMathDelimiters } from "@/lib/math-delimiters";

type Props = Omit<Options, "children" | "remarkPlugins" | "rehypePlugins"> & {
  children: string;
};

/** react-markdown with LaTeX math (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`) typeset by KaTeX. */
export default function Markdown({ children, ...props }: Props) {
  return (
    <ReactMarkdown
      {...props}
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
    >
      {normalizeMathDelimiters(children)}
    </ReactMarkdown>
  );
}
