/**
 * Behavior tests for LaTeX math rendering.
 *
 *  - lib/math-delimiters.ts: `\(…\)` / `\[…\]` normalization
 *  - the chat / 2D-text render path (react-markdown + remark-math + KaTeX)
 *  - lib/md-to-pdf.ts: math in imported Markdown is typeset, and its TeX
 *    source is still extractable as text for the agents
 *
 * Run: npx tsx scripts/test-math.ts
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { normalizeMathDelimiters as n } from "../lib/math-delimiters";
import { remarkPlugins, rehypePlugins } from "../lib/markdown-math";
import { markdownToPdf } from "../lib/md-to-pdf";
import { extractPdf } from "../lib/pdf-extract";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`);
}
function eq(name: string, actual: string, expected: string) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}`);
}

// ── Delimiter normalization ─────────────────────────────────────────────
eq("inline \\( \\) becomes $ $", n("so \\(x^2\\) grows"), "so $x^2$ grows");
eq("display \\[ \\] on its own line becomes a $$ block", n("\\[\\frac{a}{b}\\]"), "$$\n\\frac{a}{b}\n$$");
eq("mid-line \\[ \\] becomes $$ $$", n("so \\[x\\] here"), "so $$x$$ here");
eq("one-line $$ $$ on its own line becomes a block", n("a\n$$x$$\nb"), "a\n$$\nx\n$$\nb");
eq("display block keeps list indentation", n("- item\n  \\[x\\]"), "- item\n  $$\n  x\n  $$");
eq("display next to inline code stays inline", n("`c` \\[x\\]"), "`c` $$x$$");
eq("currency is escaped, not math", n("$20,000 and $30,000"), "\\$20,000 and \\$30,000");
eq("a lone $ is escaped", n("costs $5 total"), "costs \\$5 total");
eq("math next to currency", n("$x$ costs $5"), "$x$ costs \\$5");
eq("multiline display", n("\\[\na + b\n\\]"), "$$\na + b\n$$");
eq("dollar math is untouched", n("$a$ and $$b$$"), "$a$ and $$b$$");
eq("plain text is untouched", n("no math here (really)"), "no math here (really)");
eq("escaped backslash is not a delimiter", n("a \\\\(b) c"), "a \\\\(b) c");
eq("inline code is untouched", n("`\\(x\\)` vs \\(y\\)"), "`\\(x\\)` vs $y$");
eq("double-backtick code is untouched", n("``a ` \\(x\\)`` vs \\(y\\)"), "``a ` \\(x\\)`` vs $y$");
eq("fenced code is untouched", n("```tex\n\\[x\\]\n```\n\\[y\\]"), "```tex\n\\[x\\]\n```\n$$\ny\n$$");
eq("indented code is untouched", n("text\n\n    \\(x\\)\n\n\\(y\\)"), "text\n\n    \\(x\\)\n\n$y$");
eq("indented list continuation is prose", n("- item\n\n    see \\(x\\)"), "- item\n\n    see $x$");
eq("indented code after a paragraph is code", n("para\n\n    \\(x\\)"), "para\n\n    \\(x\\)");
eq("unclosed fence keeps the rest as code", n("````\n\\(x\\)\n```\n\\(y\\)"), "````\n\\(x\\)\n```\n\\(y\\)");

// Many openers with no closer must stay linear (was quadratic as a regex).
// The old regex took minutes on this; a linear pass takes milliseconds, so
// the generous cap catches a quadratic regression without flaking on slow CI.
const hostile = "\\( \\[ ` $$ ".repeat(200_000);
const t0 = performance.now();
const out = n(hostile);
const ms = performance.now() - t0;
check("unmatched openers stay fast", out.length >= hostile.length && ms < 3000, `${ms.toFixed(0)} ms`);

// ── Chat / 2D text render path ──────────────────────────────────────────
const html = (md: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins, rehypePlugins }, n(md)));

check("$…$ renders KaTeX", html("so $x^2$ grows").includes('class="katex"'));
check("\\(…\\) renders KaTeX", html("so \\(x^2\\) grows").includes('class="katex"'));
check("\\[…\\] renders display KaTeX", html("\\[\\frac{a}{b}\\]").includes("katex-display"));
check("bad TeX renders an error, not a throw", html("$\\frac{a$").includes("katex-error"));
check("one-line $$ $$ renders as display", html("$$\\frac{a}{b}$$").includes("katex-display"));
check("currency stays text", !html("$20,000 and $30,000").includes("katex") && html("$20,000 and $30,000").includes("$20,000 and $30,000"));
check("code stays code", !html("`\\(x\\)`").includes("katex") && html("`\\(x\\)`").includes("<code>\\(x\\)</code>"));

// ── Markdown → PDF import ───────────────────────────────────────────────
async function pdfChecks() {
  const md = [
    "# Limits",
    "",
    "Siano $a_n=\\dfrac{(-1)^n}{n}$ e $b_n\\to0$. Allora",
    "$$",
    "\\lim_{n\\to\\infty}\\frac{a_n}{b_n}",
    "$$",
    "Posto \\(c_n\\): **bold** and a [link](https://example.com), price $5 and `$code$`.",
    "",
    "- item with $\\sqrt{x^2+1}$",
    "- broken $\\frac{a$",
    "",
    "Plain symbols x → ∞, ε > 0. ∎",
    "",
    "| $\\lim a_n$ | note |",
    "|---|---|",
    "| $\\pm\\infty$ | regola dei segni |",
  ].join("\n");
  const pdf = await markdownToPdf(md);
  const text = (await extractPdf(new Uint8Array(pdf))).pages
    .flatMap((p) => p.items.map((i) => i.str))
    .join(" ");
  check("PDF: inline TeX source is extractable", text.includes("a_n=\\dfrac{(-1)^n}{n}"), text.slice(0, 200));
  check("PDF: display TeX source is extractable", text.includes("\\lim_{n\\to\\infty}\\frac{a_n}{b_n}"));
  check("PDF: \\(…\\) math is typeset too", text.includes("c_n") && !text.includes("\\(c_n"));
  check("PDF: no raw $$ delimiters left", !text.includes("$$"));
  check("PDF: prose around math survives", ["Siano", "Allora", "Posto", "bold", "link", "item with"].every((w) => text.includes(w)));
  check("PDF: plain-text math symbols are typeset", ["\\to", "\\infty", "\\varepsilon", "\\blacksquare"].every((t) => text.includes(t)));
  check("PDF: table cells are typeset", text.includes("\\lim a_n") && text.includes("\\pm\\infty") && text.includes("regola dei segni"));
  check("PDF: price and code spans are not math", text.includes("$5") && text.includes("$code$"));
}

async function tallRowChecks() {
  const left = Array.from({ length: 600 }, (_, i) => `L${i} $x_{${i}}$`).join(" ");
  const right = Array.from({ length: 600 }, (_, i) => `R${i} words`).join(" ");
  const pdf = await markdownToPdf(`| a | b |\n|---|---|\n| ${left} | ${right} |\n`);
  const pages = (await extractPdf(new Uint8Array(pdf))).pages;
  check("PDF: a row taller than a page spans pages", pages.length > 1, `${pages.length} page(s)`);
  const firstY = (re: RegExp) => pages[1]?.items.find((it) => re.test(it.str))?.y;
  const yl = firstY(/\bL\d+/);
  const yr = firstY(/\bR\d+/);
  check("PDF: cells of a split row stay aligned", yl !== undefined && yr !== undefined && Math.abs(yl - yr) < 6, `left ${yl}, right ${yr}`);
}

pdfChecks()
  .then(tallRowChecks)
  .catch((err) => check("PDF: renders without throwing", false, String(err)))
  .finally(() => {
    if (failures) {
      console.log(`\n${failures} failure(s)`);
      process.exit(1);
    }
    console.log("\nall passed");
  });
