// Fails when a CSS block comment ends early because its text contains `*/`
// (for example `--bg-*/--text-*`). The rest of the comment then parses as CSS and
// Turbopack fails with a parse error that does not name the cause (pitfall C10:
// af10eca then 5a99320, 0f85874 then c52c8c3).
import fs from "node:fs";

export function strayTerminators(css) {
  const hits = [];
  let i = 0, line = 1, inComment = false;
  while (i < css.length) {
    if (css[i] === "\n") line++;
    if (!inComment && css.startsWith("/*", i)) { inComment = true; i += 2; continue; }
    if (inComment && css.startsWith("*/", i)) { inComment = false; i += 2; continue; }
    if (!inComment && css.startsWith("*/", i)) { hits.push(line); i += 2; continue; }
    i++;
  }
  return hits;
}

const files = process.argv.slice(2);
let bad = 0;
for (const f of files) {
  for (const line of strayTerminators(fs.readFileSync(f, "utf8"))) {
    bad++;
    console.log(`${f}:${line}: stray "*/" outside a comment. A "*/" inside comment text (like "--bg-*/") closed the comment early. Write "--bg-* /" or rephrase the comment.`);
  }
}
process.exit(bad ? 1 : 0);
