/**
 * remark-math only understands `$…$` and `$$…$$`, but models routinely answer
 * with LaTeX-style `\(…\)` and `\[…\]`. Rewrite those to dollar delimiters so
 * they render, leaving fenced code blocks and inline code spans untouched.
 */

// Fenced blocks first, then inline code spans; both are passed through as-is.
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;

export function normalizeMathDelimiters(md: string): string {
  return md
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => `$$${tex}$$`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => `$${tex}$`),
    )
    .join("");
}
