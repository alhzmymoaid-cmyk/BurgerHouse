import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const parseManifest = (file) => JSON.parse(read(file));

const apps = [
  {
    name: 'staff',
    manifest: 'public/manifest-staff.webmanifest',
    scope: '/staff',
    start: '/staff/orders',
    login: '/staff/login',
    layout: 'src/app/staff/layout.tsx'
  },
  {
    name: 'owner',
    manifest: 'public/manifest-owner.webmanifest',
    scope: '/owner-studio',
    start: '/owner-studio',
    login: '/owner-studio/login',
    layout: 'src/app/owner-studio/layout.tsx'
  },
  {
    name: 'catalog',
    manifest: 'public/manifest-catalog.webmanifest',
    scope: '/catalog-studio',
    start: '/catalog-studio',
    login: '/catalog-studio/login',
    layout: 'src/app/catalog-studio/layout.tsx'
  },
  {
    name: 'admin',
    manifest: 'public/manifest-admin.webmanifest',
    scope: '/bh-sovereign-vault',
    start: '/bh-sovereign-vault',
    login: '/bh-sovereign-vault/login',
    layout: 'src/app/bh-sovereign-vault/layout.tsx'
  }
];

const isWithinScope = (pathname, scope) =>
  pathname === scope || pathname.startsWith(`${scope}/`);

test('each management PWA starts inside its own isolated scope', () => {
  for (const app of apps) {
    const manifest = parseManifest(app.manifest);
    assert.equal(manifest.start_url, app.start, `${app.name} start_url`);
    assert.equal(manifest.scope, app.scope, `${app.name} scope`);
    assert.ok(isWithinScope(manifest.start_url, manifest.scope), `${app.name} start_url must be in scope`);
    assert.ok(isWithinScope(app.login, manifest.scope), `${app.name} login must be in scope`);
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
    assert.match(read(app.layout), new RegExp(manifestFileName(app.manifest)));
  }
});

function manifestFileName(file) {
  return file.split('/').at(-1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('customer PWA remains rooted at the storefront only', () => {
  const manifest = parseManifest('public/manifest.webmanifest');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.id, '/');
});

test('middleware routes unauthenticated dashboards to in-scope login pages', () => {
  const middleware = read('src/middleware.ts');
  for (const app of apps) {
    assert.ok(middleware.includes(app.login), `${app.name} login redirect`);
    assert.ok(fs.existsSync(path.join(root, `src/app${app.login}/page.tsx`)), `${app.name} login page`);
  }
  assert.match(middleware, /isStaffLogin/);
  assert.match(middleware, /isOwnerLogin/);
  assert.match(middleware, /isCatalogLogin/);
  assert.match(middleware, /isSovereignLogin/);
});

test('offline navigation never falls back to the public customer homepage', () => {
  const worker = read('public/sw.js');
  assert.match(worker, /burger-house-shell-v10/);
  assert.match(worker, /'\/offline\.html'/);
  assert.match(worker, /caches\.match\('\/offline\.html'\)/);
  assert.doesNotMatch(worker, /caches\.match\('\/'\)/);
});
