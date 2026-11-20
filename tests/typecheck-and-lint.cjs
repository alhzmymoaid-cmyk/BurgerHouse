const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const ROOT = process.cwd();

function getFiles(dir, exts) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'public'].includes(entry.name)) {
        out = out.concat(getFiles(full, exts));
      }
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const allSourceFiles = getFiles(path.join(ROOT, 'src'), ['.ts', '.tsx', '.mjs']);
let parsedCount = 0;

for (const file of allSourceFiles) {
  const code = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const scriptKind = file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

  // Use the project's installed TypeScript parser so the check works in CI and on Vercel.
  const sourceFile = ts.createSourceFile(
    rel,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  assert.equal(
    sourceFile.parseDiagnostics.length,
    0,
    `TypeScript/JS syntax errors in ${rel}: ${sourceFile.parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\\n'))
      .join('; ')}`
  );
  parsedCount++;

  // Security lint assertions
  assert.ok(!code.includes('ordersMemoryStore'), `Forbidden ordersMemoryStore in ${rel}`);
  assert.ok(!code.includes('bh-default-hmac-secret'), `Forbidden default secret in ${rel}`);
  assert.ok(!code.includes('bh-captcha-secret'), `Forbidden default secret in ${rel}`);
  assert.ok(!code.includes('p_actor_uid'), `Forbidden p_actor_uid parameter in ${rel} (must use auth.uid())`);

  // Verify GET tracking URL token is removed
  if (rel.endsWith('src/app/page.tsx')) {
    assert.ok(!code.includes('/api/orders/track?code='), 'Tracking token must not be sent in GET URL query string');
  }
}

console.log(`[PASS] TypeScript/JSX AST Verification & Security Lint passed across ${parsedCount} source files (0 errors).`);
