// Builds web/standalone.html: the same page with every src module inlined,
// so it opens by double-click (file://), where browsers block ES module imports.
// Run: npm run standalone
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';

const root = dirname(new URL(import.meta.url).pathname);
const ORDER = ['src/planner/engine.js', 'src/planner/parse.js', 'src/planner/examples.js', 'src/planner/valuation.js'];
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/g;

const destructure = (names, spec, fromFile) => {
  const key = relative(root, resolve(dirname(resolve(root, fromFile)), spec));
  if (!ORDER.includes(key)) throw new Error(`unknown import ${spec} in ${fromFile}`);
  return `const {${names.trim()}} = __M["${key}"];`;
};

const modules = ORDER.map((file) => {
  let code = readFileSync(resolve(root, file), 'utf8');
  code = code.replace(IMPORT, (_, names, spec) => destructure(names, spec, file));
  const exported = [];
  code = code.replace(/^export (function|const|let) ([A-Za-z0-9_$]+)/gm, (_, kind, name) => { exported.push(name); return `${kind} ${name}`; });
  return `__M["${file}"] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`;
}).join('\n');

let html = readFileSync(resolve(root, 'web/index.html'), 'utf8');
html = html.replace(IMPORT, (_, names, spec) => destructure(names, spec, 'web/index.html'));
const registry = `<script>\nconst __M = {};\n${modules}\n</script>\n`;
html = html.replace('<script type="module">', () => registry + '<script type="module">');
writeFileSync(resolve(root, 'web/standalone.html'), html);
console.log(`built web/standalone.html (${html.length} bytes)`);
