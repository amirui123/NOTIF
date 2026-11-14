import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStaticServer } from '../../scripts/serve.js';

describe('dev server', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createStaticServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('serves index.html as UTF-8 HTML', async () => {
    const res = await fetch(`${baseUrl}/index.html`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /SECTOR-7/);
  });

  it('serves modules with a JavaScript MIME type', async () => {
    const res = await fetch(`${baseUrl}/src/main.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/javascript/);
  });

  it('serves vendored three.js', async () => {
    const res = await fetch(`${baseUrl}/vendor/three/build/three.module.js`);
    assert.equal(res.status, 200);
    assert.ok(Number(res.headers.get('content-length') ?? 0) !== 0);
  });

  it('serves the stylesheet', async () => {
    const res = await fetch(`${baseUrl}/styles/main.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/css/);
  });

  it('returns 404 for missing files', async () => {
    const res = await fetch(`${baseUrl}/does-not-exist.js`);
    assert.equal(res.status, 404);
  });

  it('blocks directory traversal', async () => {
    const res = await fetch(`${baseUrl}/../../../etc/passwd`);
    assert.equal(res.status, 404);
  });

  it('sets nosniff', async () => {
    const res = await fetch(`${baseUrl}/index.html`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});
