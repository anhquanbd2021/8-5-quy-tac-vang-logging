import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('health and version endpoints respond', async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');
    const version = await fetch(`${base}/version`);
    assert.equal(version.status, 200);
    const meta = await version.json();
    assert.equal(meta.name, 'silent-bug-hunter-demo');
  });
});

test('allowlisted assets serve; everything else 404s', async () => {
  await withServer(async (base) => {
    for (const path of ['/', '/guide.html', '/styles.css', '/app.js', '/service.mjs', '/hunter.mjs', '/scenarios.mjs']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
    }
    for (const path of ['/package.json', '/../app/server.js', '/nope']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, path);
    }
  });
});
