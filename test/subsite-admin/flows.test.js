import { test, beforeEach } from 'node:test';
/* global globalThis */
import assert from 'node:assert/strict';
import { createSite, deleteSite } from '../../tools/subsite-admin/flows.js';

const ctx = { org: 'o', repo: 'r', token: 't' };
let calls;
let sheets;
let sitesList;

const json = (b) => new Response(JSON.stringify(b), { status: 200 });

beforeEach(() => {
  calls = [];
  sitesList = [{ name: 'other', path: '/o/r/sites/other' }];
  sheets = {
    multisite: { ':type': 'sheet', total: 1, data: [{ siteName: 'other', title: 'T' }] },
    testperm: {
      ':type': 'sheet',
      total: 1,
      data: [{
        path: '/sites/other/ + **', groups: 'g', actions: 'WRITE', notes: '',
      }],
    },
  };
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${url}`);
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
    return json({});
  };
});

test('createSite writes rows, copies, previews (not testperm)', async () => {
  const logs = [];
  const slug = await createSite(ctx, '  My  Bank! ', 'a@x.com,\r\n b@y.com', (m) => logs.push(m));
  assert.equal(slug, 'my-bank');
  assert.ok(calls.includes('POST https://admin.da.live/copy/o/r/index.html'));
  assert.ok(calls.includes('POST https://admin.da.live/copy/o/r/en'));
  assert.deepEqual(sheets.multisite.data[1], { siteName: 'my-bank', title: '' });
  assert.deepEqual(sheets.testperm.data[1], {
    path: '/sites/my-bank/ + **', groups: 'a@x.com, b@y.com', actions: 'WRITE', notes: '',
  });
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/sites/my-bank/'));
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/sites/my-bank/en/a'));
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/data/multisite'));
  assert.ok(!calls.some((c) => c.includes('preview') && c.includes('testperm')));
  assert.equal(logs.at(-1), 'Done');
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
  sheets.testperm.data.push(
    {
      path: '/sites/my-bank/ + **', groups: 'a', actions: 'WRITE', notes: '',
    },
    {
      path: '/sites/my-bank/**', groups: 'keep', actions: 'WRITE', notes: '',
    },
  );
  await deleteSite(ctx, 'my-bank', () => {});
  assert.ok(calls.includes('DELETE https://admin.hlx.page/preview/o/r/main/sites/my-bank/'));
  assert.ok(calls.includes('DELETE https://admin.hlx.page/preview/o/r/main/sites/my-bank/en/a'));
  assert.deepEqual(sheets.multisite.data.map((r) => r.siteName), ['other']);
  assert.deepEqual(sheets.testperm.data.map((r) => r.path), ['/sites/other/ + **', '/sites/my-bank/**']);
  assert.ok(calls.includes('POST https://admin.hlx.page/preview/o/r/main/data/multisite'));
  assert.equal(calls.at(-1), 'DELETE https://admin.da.live/source/o/r/sites/my-bank');
});

test('deleteSite tolerates missing rows', async () => {
  await deleteSite(ctx, 'my-bank', () => {});
  assert.equal(sheets.multisite.data.length, 1);
  assert.equal(sheets.testperm.data.length, 1);
});
