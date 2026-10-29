import { test, beforeEach } from 'node:test';
/* global globalThis */
import assert from 'node:assert/strict';
import { createSite, deleteSite } from '../../tools/subsite-admin/flows.js';

const ctx = { org: 'o', repo: 'r', token: 't' };
const CONFIG_URL = 'https://admin.da.live/config/o/';
let calls;
let sheets;
let sitesList;
let pages;
let config;

const json = (b) => new Response(JSON.stringify(b), { status: 200 });
const otherTab = () => ({ total: 1, data: [{ key: 'k', value: 'v' }] });

beforeEach(() => {
  calls = [];
  pages = {};
  sitesList = [{ name: 'other', path: '/o/r/sites/other' }];
  sheets = {
    multisite: { ':type': 'sheet', total: 1, data: [{ siteName: 'other', title: 'T' }] },
  };
  config = {
    ':type': 'multi-sheet',
    ':names': ['data', 'permissions'],
    data: otherTab(),
    permissions: {
      total: 1,
      data: [{
        path: '/r/sites/other/ + **', groups: 'g', actions: 'write', comments: '',
      }],
    },
  };
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${url}`);
    if (url === CONFIG_URL && method === 'GET') return json(config);
    if (url === CONFIG_URL && method === 'POST') {
      config = JSON.parse(opts.body.get('config'));
      return json({});
    }
    const sheet = url.match(/source\/o\/r\/data\/(\w+)\.json$/);
    if (sheet && method === 'GET') return json(sheets[sheet[1]]);
    if (sheet && method === 'PUT') {
      sheets[sheet[1]] = JSON.parse(await opts.body.get('data').text());
      return json({});
    }
    if (url.endsWith('/list/o/r/sites')) return json(sitesList);
    if (url.endsWith('/list/o/r/sites/my-bank')) {
      return json([{ name: 'index', ext: 'html', path: '/o/r/sites/my-bank/index.html' },
        { name: 'en', path: '/o/r/sites/my-bank/en' }]);
    }
    if (url.endsWith('/list/o/r/sites/my-bank/en')) {
      return json([{ name: 'a', ext: 'html', path: '/o/r/sites/my-bank/en/a.html' }]);
    }
    const page = url.match(/source\/o\/r(\/sites\/my-bank\/.+\.html)$/);
    if (page && method === 'GET') return new Response(pages[page[1]] ?? '', { status: 200 });
    if (page && method === 'PUT') {
      pages[page[1]] = await opts.body.get('data').text();
      return json({});
    }
    return json({});
  };
});

test('createSite rewrites copied page links before preview, skips unchanged', async () => {
  pages['/sites/my-bank/index.html'] = '<a href="/en/a">A</a>';
  pages['/sites/my-bank/en/a.html'] = '<a href="https://x.com">X</a>';
  await createSite(ctx, 'My Bank', 'a', () => {});
  assert.equal(pages['/sites/my-bank/index.html'], '<a href="/sites/my-bank/en/a">A</a>');
  const put = calls.indexOf('PUT https://admin.da.live/source/o/r/sites/my-bank/index.html');
  assert.ok(put > -1);
  assert.ok(put < calls.indexOf('POST https://admin.hlx.page/preview/o/r/main/sites/my-bank/'));
  assert.ok(!calls.includes('PUT https://admin.da.live/source/o/r/sites/my-bank/en/a.html'));
});

test('createSite writes multisite + permissions rows, copies, previews', async () => {
  const logs = [];
  const slug = await createSite(ctx, '  My  Bank! ', 'a@x.com,\r\n b@y.com', (m) => logs.push(m));
  assert.equal(slug, 'my-bank');
  assert.ok(calls.includes('POST https://admin.da.live/copy/o/r/index.html'));
  assert.ok(calls.includes('POST https://admin.da.live/copy/o/r/en'));
  assert.deepEqual(sheets.multisite.data[1], { siteName: 'my-bank', title: '' });
  assert.deepEqual(config.permissions.data[1], {
    path: '/r/sites/my-bank/ + **', groups: 'a@x.com, b@y.com', actions: 'write', comments: '',
  });
  assert.equal(config.permissions.total, 2);
  assert.deepEqual(config.data, otherTab());
  assert.deepEqual(config[':names'], ['data', 'permissions']);
  assert.ok(!calls.some((c) => c.includes('testperm')));
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/sites/my-bank/'));
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/sites/my-bank/en/a'));
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/data/multisite.json'));
  assert.equal(logs.at(-1), 'Done');
});

test('createSite reads org config after copying (just before saving)', async () => {
  await createSite(ctx, 'My Bank', 'a', () => {});
  const read = calls.lastIndexOf(`GET ${CONFIG_URL}`);
  const save = calls.indexOf(`POST ${CONFIG_URL}`);
  assert.ok(read > calls.indexOf('POST https://admin.da.live/copy/o/r/en'));
  assert.equal(save, read + 1);
});

test('createSite adds permissions tab when config has none', async () => {
  config = { ':type': 'multi-sheet', ':names': ['data'], data: otherTab() };
  await createSite(ctx, 'My Bank', 'a', () => {});
  assert.deepEqual(config[':names'], ['data', 'permissions']);
  assert.deepEqual(config.permissions.data, [{ path: '/r/sites/my-bank/ + **', groups: 'a', actions: 'write' }]);
  assert.deepEqual(config.data, otherTab());
});

test('createSite writes cleaned launch script to multisite scriptURL', async () => {
  sheets.multisite.data[0].scriptURL = '';
  await createSite(ctx, 'My Bank', 'a', () => {}, '  https://x.com/launch.js\r\n ');
  assert.deepEqual(sheets.multisite.data[1], { siteName: 'my-bank', title: '', scriptURL: 'https://x.com/launch.js' });
});

test('createSite leaves scriptURL blank when launch script omitted', async () => {
  sheets.multisite.data[0].scriptURL = 'https://other.js';
  await createSite(ctx, 'My Bank', 'a', () => {});
  assert.deepEqual(sheets.multisite.data[1], { siteName: 'my-bank', title: '', scriptURL: '' });
});

test('createSite rejects empty slug before any network call', async () => {
  await assert.rejects(createSite(ctx, '!!!', 'a', () => {}), /Invalid site name/);
  assert.equal(calls.length, 0);
});

test('createSite rejects empty users', async () => {
  await assert.rejects(createSite(ctx, 'x', ' \n ', () => {}), /Users required/);
  assert.equal(calls.length, 0);
});

test('createSite blocks when folder exists', async () => {
  sitesList.push({ name: 'my-bank', path: '/o/r/sites/my-bank' });
  await assert.rejects(createSite(ctx, 'My Bank', 'a', () => {}), /already exists/);
  assert.ok(!calls.some((c) => c.startsWith('POST') || c.startsWith('PUT')));
});

test('createSite blocks when multisite row exists', async () => {
  sheets.multisite.data.push({ siteName: 'my-bank', title: '' });
  await assert.rejects(createSite(ctx, 'My Bank', 'a', () => {}), /already exists/);
  assert.ok(!calls.some((c) => c.startsWith('POST') || c.startsWith('PUT')));
});

test('deleteSite unpreviews, removes exact rows, re-previews multisite, deletes folder last', async () => {
  sheets.multisite.data.push({ siteName: 'my-bank', title: '' });
  config.permissions.data.push(
    {
      path: '/r/sites/my-bank/ + **', groups: 'a', actions: 'write', comments: '',
    },
    {
      path: '/r/sites/my-bank/**', groups: 'keep', actions: 'write', comments: '',
    },
  );
  await deleteSite(ctx, 'my-bank', () => {});
  assert.ok(calls.includes('DELETE https://admin.hlx.page/preview/o/r/main/sites/my-bank/'));
  assert.ok(calls.includes('DELETE https://admin.hlx.page/preview/o/r/main/sites/my-bank/en/a'));
  assert.deepEqual(sheets.multisite.data.map((r) => r.siteName), ['other']);
  assert.deepEqual(config.permissions.data.map((r) => r.path), ['/r/sites/other/ + **', '/r/sites/my-bank/**']);
  assert.deepEqual(config.data, otherTab());
  assert.ok(!calls.some((c) => c.includes('testperm')));
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/data/multisite.json'));
  assert.equal(calls.at(-1), 'DELETE https://admin.da.live/source/o/r/sites/my-bank');
});

test('deleteSite tolerates missing rows and missing permissions tab', async () => {
  await deleteSite(ctx, 'my-bank', () => {});
  assert.equal(sheets.multisite.data.length, 1);
  assert.equal(config.permissions.data.length, 1);
  config = { ':type': 'multi-sheet', ':names': ['data'], data: otherTab() };
  await deleteSite(ctx, 'my-bank', () => {});
  assert.deepEqual(config.data, otherTab());
});

test('createSite partial failure tells user to delete before retrying', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (url.includes('/copy/o/r/en')) return new Response('', { status: 500 });
    return orig(url, opts);
  };
  await assert.rejects(
    createSite(ctx, 'My Bank', 'a', () => {}),
    /500.*Partial site "my-bank" may exist; use Delete to clean up before retrying/s,
  );
});
