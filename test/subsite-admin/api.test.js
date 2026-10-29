import { test, beforeEach } from 'node:test';
/* global globalThis */
import assert from 'node:assert/strict';
import {
  listFolder, copy, readSheet, writeSheet, deleteSource, crawlPages, preview, unpreview,
  readSource, writeSource,
} from '../../tools/subsite-admin/api.js';

const ctx = { org: 'o', repo: 'r', token: 't' };
let calls;
let responder;

beforeEach(() => {
  calls = [];
  responder = () => new Response('[]', { status: 200 });
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return responder(url, opts);
  };
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('listFolder GETs list endpoint with auth', async () => {
  responder = () => json([{ name: 'a', path: '/o/r/sites/a' }]);
  const items = await listFolder(ctx, '/sites');
  assert.equal(calls[0].url, 'https://admin.da.live/list/o/r/sites');
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer t');
  assert.deepEqual(items, [{ name: 'a', path: '/o/r/sites/a' }]);
});

test('listFolder 404 returns []', async () => {
  responder = () => new Response('', { status: 404 });
  assert.deepEqual(await listFolder(ctx, '/sites'), []);
});

test('listFolder 500 throws', async () => {
  responder = () => new Response('', { status: 500 });
  await assert.rejects(listFolder(ctx, '/sites'), /500/);
});

test('copy POSTs destination', async () => {
  await copy(ctx, '/en', '/sites/x/en');
  assert.equal(calls[0].url, 'https://admin.da.live/copy/o/r/en');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer t');
  assert.equal(calls[0].opts.body.get('destination'), '/o/r/sites/x/en');
});

test('readSheet GETs .json source', async () => {
  responder = () => json({ data: [] });
  assert.deepEqual(await readSheet(ctx, '/data/multisite'), { data: [] });
  assert.equal(calls[0].url, 'https://admin.da.live/source/o/r/data/multisite.json');
});

test('writeSheet PUTs data blob', async () => {
  const body = { ':type': 'sheet', data: [{ path: '/sites/x/ + **' }] };
  await writeSheet(ctx, '/data/testperm', body);
  assert.equal(calls[0].url, 'https://admin.da.live/source/o/r/data/testperm.json');
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer t');
  const blob = calls[0].opts.body.get('data');
  assert.deepEqual(JSON.parse(await blob.text()), body);
});

test('readSource/writeSource', async () => {
  responder = () => new Response('<p>x</p>', { status: 200 });
  assert.equal(await readSource(ctx, '/sites/x/en/a.html'), '<p>x</p>');
  assert.equal(calls[0].url, 'https://admin.da.live/source/o/r/sites/x/en/a.html');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer t');
  await writeSource(ctx, '/sites/x/en/a.html', '<p>y</p>');
  assert.equal(calls[1].opts.method, 'PUT');
  const blob = calls[1].opts.body.get('data');
  assert.equal(blob.type, 'text/html');
  assert.equal(await blob.text(), '<p>y</p>');
});

test('deleteSource DELETEs', async () => {
  await deleteSource(ctx, '/sites/x');
  assert.equal(calls[0].url, 'https://admin.da.live/source/o/r/sites/x');
  assert.equal(calls[0].opts.method, 'DELETE');
});

test('crawlPages recurses and returns html web paths', async () => {
  responder = (url) => {
    if (url.endsWith('/list/o/r/sites/x')) {
      return json([
        { name: 'index', ext: 'html', path: '/o/r/sites/x/index.html' },
        { name: 'en', path: '/o/r/sites/x/en' },
      ]);
    }
    if (url.endsWith('/list/o/r/sites/x/en')) {
      return json([
        { name: 'a', ext: 'html', path: '/o/r/sites/x/en/a.html' },
        { name: 'img', ext: 'png', path: '/o/r/sites/x/en/img.png' },
        { name: 'q', ext: 'json', path: '/o/r/sites/x/en/q.json' },
      ]);
    }
    return json([]);
  };
  const pages = await crawlPages(ctx, '/sites/x');
  assert.deepEqual(pages.sort(), ['/sites/x/en/a', '/sites/x/index']);
});

test('preview POSTs to admin.hlx.page and normalizes index', async () => {
  await preview(ctx, '/data/multisite');
  await preview(ctx, '/sites/x/index');
  await preview(ctx, '/sites/x/en/index');
  assert.equal(calls[0].url, 'https://admin.hlx.page/preview/o/r/main/data/multisite');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer t');
  assert.equal(calls[1].url, 'https://admin.hlx.page/preview/o/r/main/sites/x/');
  assert.equal(calls[2].url, 'https://admin.hlx.page/preview/o/r/main/sites/x/en/');
});

test('unpreview DELETEs; 404 is success; 500 throws', async () => {
  responder = () => new Response('', { status: 404 });
  await unpreview(ctx, '/sites/x/en/a');
  assert.equal(calls[0].url, 'https://admin.hlx.page/preview/o/r/main/sites/x/en/a');
  assert.equal(calls[0].opts.method, 'DELETE');
  responder = () => new Response('', { status: 500 });
  await assert.rejects(unpreview(ctx, '/sites/x/en/a'), /500/);
});
