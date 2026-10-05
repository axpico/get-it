/**
 * Behavior tests for LaTeX delimiter normalization (lib/math-delimiters.ts).
 *
 * Run: npx tsx scripts/test-math.ts
 */

import { normalizeMathDelimiters as n } from "../lib/math-delimiters";

let failures = 0;
function check(name: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — got ${JSON.stringify(actual)}`}`);
}

check("inline \\( \\) becomes $ $", n("so \\(x^2\\) grows"), "so $x^2$ grows");
check("display \\[ \\] becomes $$ $$", n("\\[\\frac{a}{b}\\]"), "$$\\frac{a}{b}$$");
check("multiline display", n("\\[\na + b\n\\]"), "$$\na + b\n$$");
check("dollar math is untouched", n("$a$ and $$b$$"), "$a$ and $$b$$");
check("inline code is untouched", n("`\\(x\\)` vs \\(y\\)"), "`\\(x\\)` vs $y$");
check(
  "fenced code is untouched",
  n("```tex\n\\[x\\]\n```\n\\[y\\]"),
  "```tex\n\\[x\\]\n```\n$$y$$",
);
check("plain text is untouched", n("no math here (really)"), "no math here (really)");

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
