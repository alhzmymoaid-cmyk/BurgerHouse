import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();

function getAllFiles(dir, exts) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'public', 'tests'].includes(entry.name)) {
        results = results.concat(getAllFiles(full, exts));
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const sourceFiles = getAllFiles(path.join(ROOT, 'src'), ['.ts', '.tsx', '.mjs']);

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // 1. Ensure no in-memory ordersMemoryStore Map exists in API routes
  assert.ok(!content.includes('ordersMemoryStore'), `Forbidden ordersMemoryStore found in ${rel}`);

  // 2. Ensure no hardcoded fallback secrets exist in src/
  assert.ok(!content.includes('bh-default-hmac-secret'), `Forbidden hardcoded HMAC secret found in ${rel}`);
  assert.ok(!content.includes('bh-captcha-secret'), `Forbidden hardcoded CAPTCHA secret found in ${rel}`);

  // 3. Ensure middleware does not trust x-bh-actor-role header
  if (rel.endsWith('middleware.ts')) {
    assert.ok(!content.includes('x-bh-actor-role'), 'Middleware must not trust x-bh-actor-role header');
    assert.ok(content.includes('supabase.auth.getUser()'), 'Middleware must verify session via supabase.auth.getUser()');
  }

  // 4. Ensure NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is never used as a client variable
  if (file.endsWith('.tsx')) {
    assert.ok(
      !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
      `Client component ${rel} must never reference SUPABASE_SERVICE_ROLE_KEY`
    );
  }
}

console.log(`Static & Security Audit Passed across ${sourceFiles.length} source files (0 violations).`);
