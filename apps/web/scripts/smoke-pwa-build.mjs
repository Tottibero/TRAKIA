import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'))
const worker = await readFile(join(root, 'sw.js'), 'utf8')
const html = await readFile(join(root, 'index.html'), 'utf8')

assert.equal(manifest.name, 'TRAKIA')
assert.equal(manifest.short_name, 'TRAKIA')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.background_color, '#0B0C0C')
assert.equal(manifest.theme_color, '#0B0C0C')
assert.equal(manifest.lang, 'es')

const icons = new Map(manifest.icons.map((icon) => [icon.src, icon]))
assert.equal(icons.get('/pwa/icon-192.png')?.sizes, '192x192')
assert.equal(icons.get('/pwa/icon-512.png')?.sizes, '512x512')
assert.equal(icons.get('/pwa/icon-512-maskable.png')?.purpose, 'maskable')

for (const icon of icons.values()) {
  const bytes = await readFile(join(root, icon.src.slice(1)))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes)
}

assert.match(worker, /precacheAndRoute\(/)
assert.match(worker, /cleanupOutdatedCaches/)
assert.match(worker, /denylist:\[\/\^\\\/api/)
assert.match(worker, /clientsClaim/)
assert.match(worker, /skipWaiting/)
assert.doesNotMatch(worker, /new e\.(?:NetworkFirst|CacheFirst|StaleWhileRevalidate)/)
assert.doesNotMatch(worker, /url:"\/?api(?:\/|"|\?)/)
assert.match(html, /registerSW\.js/)
assert.match(html, /apple-mobile-web-app-capable" content="yes"/)
assert.match(html, /apple-touch-icon" href="\/pwa\/icon-180\.png"/)
assert.match(html, /viewport-fit=cover/)

const appleIcon = await readFile(join(root, 'pwa/icon-180.png'))
assert.equal(`${appleIcon.readUInt32BE(16)}x${appleIcon.readUInt32BE(20)}`, '180x180')

console.log(
  'PWA smoke passed: manifest and icons are valid; service worker precaches static assets only and excludes API navigation fallback.',
)
