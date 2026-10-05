/**
 * LaTeX math for the Markdown → PDF importer (lib/md-to-pdf.ts).
 *
 * `marked` knows nothing about math, so left alone it mangles `$a_n$` into
 * emphasis and prints the rest as raw TeX. These extensions lift `$…$` and
 * `$$…$$` out as their own tokens, and `renderMath` typesets them with
 * MathJax into self-contained SVG (glyphs as paths, no font cache) that
 * svg-to-pdfkit can draw straight onto the page as vector graphics.
 */

import type { TokenizerExtension } from "marked";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

export type MathToken = { type: "mathBlock" | "mathInline"; raw: string; text: string; display: boolean };

// `$$…$$` on its own line(s). `start` lets it interrupt a running paragraph,
// since students routinely write display math with no blank line around it.
const mathBlock: TokenizerExtension = {
  name: "mathBlock",
  level: "block",
  start: (src) => src.match(/(?:^|\n)\$\$/)?.index,
  tokenizer(src): MathToken | undefined {
    const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src);
    if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim(), display: true };
  },
};

// `$$…$$` mid-line (display) and `$…$` (inline). An opening `$` followed by
// whitespace, or a closing `$` followed by a digit, is a price, not math;
// backticks never appear in TeX, so a span crossing one isn't math either.
const mathInline: TokenizerExtension = {
  name: "mathInline",
  level: "inline",
  start: (src) => src.indexOf("$"),
  tokenizer(src): MathToken | undefined {
    const d = /^\$\$([^`]+?)\$\$/.exec(src);
    if (d) return { type: "mathInline", raw: d[0], text: d[1].trim(), display: true };
    const m = /^\$(?!\s)((?:\\.|[^\\$`])+?)\$(?!\d)/.exec(src);
    if (m) return { type: "mathInline", raw: m[0], text: m[1], display: false };
  },
};

export const mathExtensions = [mathBlock, mathInline];

/** A typeset formula in PDF points: `ascent` above the baseline, `descent` below. */
export type RenderedMath = { svg: string; width: number; ascent: number; descent: number };

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
let texDoc: ReturnType<typeof mathjax.document> | null = null;
// Documents repeat formulas (and symbols) constantly; typeset each once.
// ponytail: cleared wholesale when full, an LRU if hit rates ever matter.
const cache = new Map<string, RenderedMath>();
const CACHE_MAX = 2000;

/** Typeset `tex` at `size` pt. Bad TeX comes back as MathJax's red error box, never a throw. */
export function renderMath(tex: string, display: boolean, size: number, color: string): RenderedMath {
  const key = `${display ? "D" : "I"}|${size}|${color}|${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= CACHE_MAX) cache.clear();
  const rendered = typeset(tex, display, size, color);
  cache.set(key, rendered);
  return rendered;
}

function typeset(tex: string, display: boolean, size: number, color: string): RenderedMath {
  texDoc ??= mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: new SVG({ fontCache: "none" }),
  });
  const svgNode = adaptor.firstChild(texDoc.convert(tex, { display })) as Parameters<typeof adaptor.outerHTML>[0];
  // viewBox is in 1000ths of an em, with y = 0 on the baseline.
  const [, minY, w, h] = String(adaptor.getAttribute(svgNode, "viewBox")).split(/\s+/).map(Number);
  const em = size / 1000;
  const width = w * em;
  const height = h * em;
  const svg = adaptor
    .outerHTML(svgNode)
    // Size the root in points; MathJax's own `ex` units would be resolved
    // against svg-to-pdfkit's idea of an ex and come out far too large.
    .replace(/^<svg[^>]*?>/, (open) =>
      open.replace(/\s(width|height|style)="[^"]*"/g, ""),
    )
    .replace(/^<svg/, `<svg width="${width}" height="${height}"`)
    // Browsers tint MathJax's error box with CSS we don't have here.
    .replace(/<rect data-background/g, '<rect fill="#fde8e8" data-background')
    .replace(/currentColor/g, color);
  return { svg, width, ascent: -minY * em, descent: height + minY * em };
}

/**
 * Math symbols students type straight into prose (`… ∎`, `x → ∞`, `ε > 0`).
 * The standard PDF fonts only encode WinAnsi (Latin-1-ish), so these would
 * print as garbage; the importer typesets them through MathJax instead.
 */
const SYMBOL_TEX: Record<string, string> = {
  "∎": "\\blacksquare", "□": "\\square", "■": "\\blacksquare",
  "→": "\\to", "←": "\\leftarrow", "↔": "\\leftrightarrow", "↦": "\\mapsto",
  "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow", "⟹": "\\implies", "⟺": "\\iff",
  "≤": "\\le", "≥": "\\ge", "≠": "\\ne", "≈": "\\approx", "≡": "\\equiv", "∼": "\\sim", "≃": "\\simeq",
  "∞": "\\infty", "∈": "\\in", "∉": "\\notin", "∋": "\\ni", "⊂": "\\subset", "⊆": "\\subseteq",
  "⊃": "\\supset", "⊇": "\\supseteq", "∪": "\\cup", "∩": "\\cap", "∅": "\\emptyset", "∖": "\\setminus",
  "∀": "\\forall", "∃": "\\exists", "∄": "\\nexists", "¬": "\\neg", "∧": "\\land", "∨": "\\lor",
  "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∮": "\\oint", "√": "\\surd", "∂": "\\partial", "∇": "\\nabla",
  "∓": "\\mp", "∘": "\\circ", "⋅": "\\cdot", "∝": "\\propto", "⊥": "\\perp", "∥": "\\parallel", "∠": "\\angle",
  "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℂ": "\\mathbb{C}",
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "ε": "\\varepsilon", "ϵ": "\\epsilon",
  "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta", "ϑ": "\\vartheta", "ι": "\\iota", "κ": "\\kappa",
  "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "ξ": "\\xi", "π": "\\pi", "ρ": "\\rho", "σ": "\\sigma",
  "ς": "\\varsigma", "τ": "\\tau", "υ": "\\upsilon", "φ": "\\varphi", "ϕ": "\\phi", "χ": "\\chi",
  "ψ": "\\psi", "ω": "\\omega", "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta", "Λ": "\\Lambda",
  "Ξ": "\\Xi", "Π": "\\Pi", "Σ": "\\Sigma", "Υ": "\\Upsilon", "Φ": "\\Phi", "Ψ": "\\Psi", "Ω": "\\Omega",
};

/** Matches a run of adjacent symbols, so `→∞` becomes one formula, not two. */
export const SYMBOL_RE = new RegExp(`([${Object.keys(SYMBOL_TEX).join("")}]+)`, "u");

/** TeX for a run matched by `SYMBOL_RE`. */
export const symbolTex = (run: string): string => Array.from(run, (ch) => SYMBOL_TEX[ch]).join(" ");
