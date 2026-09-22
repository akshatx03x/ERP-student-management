const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const staticSrc = path.join(root, '.next/static');
const staticDest = path.join(root, '.next/standalone/.next/static');
const publicSrc = path.join(root, 'public');
const publicDest = path.join(root, '.next/standalone/public');
const pkgSrc = path.join(root, '.next/package.json');
const pkgDest = path.join(root, '.next/standalone/.next/package.json');

console.log('[post-build] Syncing static assets and standalone folders...');

// 1. Copy static assets
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true, dereference: true });
  console.log('[post-build] Copied .next/static -> .next/standalone/.next/static');
}

// 2. Copy public directory
if (fs.existsSync(publicSrc)) {
  fs.mkdirSync(publicDest, { recursive: true });
  fs.cpSync(publicSrc, publicDest, { recursive: true, dereference: true });
  console.log('[post-build] Copied public -> .next/standalone/public');
}

// 3. Copy package.json
if (fs.existsSync(pkgSrc)) {
  fs.copyFileSync(pkgSrc, pkgDest);
  console.log('[post-build] Copied .next/package.json');
}

// 4. Dereference standalone node_modules on Windows if necessary
const nm = path.join(root, '.next/standalone/node_modules');
if (fs.existsSync(nm)) {
  try {
    const tmp = path.join(root, '.next/nm_deref');
    if (fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
    fs.cpSync(nm, tmp, { recursive: true, dereference: true });
    try {
      fs.rmSync(nm, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      fs.cpSync(tmp, nm, { recursive: true });
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      console.log('[post-build] Dereferenced node_modules successfully');
    } catch (renameErr) {
      console.warn('[post-build] Note: Could not in-place replace node_modules (non-fatal):', renameErr.message);
    }
  } catch (err) {
    console.warn('[post-build] Warning during node_modules dereferencing (non-fatal):', err.message);
  }
}

console.log('[post-build] Post-build completed successfully.');
