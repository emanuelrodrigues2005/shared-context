import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const match = /const CSS = `([\s\S]*?)`;/.exec(source);
if (match === null) throw new Error('could not find the CSS template in client.js');

const css = match[1].replace(/^[ \t]+/gm, '');
const root = postcss.parse(css);
let rules = 0;
let declarations = 0;
root.walkRules(() => {
  rules += 1;
});
root.walkDecls(() => {
  declarations += 1;
});

const literals = [];
root.walkDecls((declaration) => {
  if (/(^|\s)(color|background|border|fill|stroke|box-shadow)\b/.test(declaration.prop)) {
    if (
      /#[0-9a-f]{3,8}\b/i.test(declaration.value) ||
      /\brgba?\(/i.test(declaration.value) ||
      /\bhsla?\(/i.test(declaration.value)
    ) {
      literals.push(`${declaration.prop}: ${declaration.value}`);
    }
  }
});

console.log(`css ok: ${String(rules)} rules, ${String(declarations)} declarations, ${String(Buffer.byteLength(css))} bytes`);
if (literals.length > 0) {
  console.log('FAIL - literal colors outside artwork:');
  for (const line of literals) console.log(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log('ok - container styling uses only theme tokens');
}
