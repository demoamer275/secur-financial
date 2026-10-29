import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPath, rewriteLinks, siteHosts } from '../../tools/subsite-admin/utils.js';

const hosts = siteHosts({ org: 'acme', repo: 'secur-financial' });
const s = 'my-bank';

test('siteHosts', () => {
  assert.deepEqual(hosts, [
    'main--secur-financial--acme.aem.page',
    'main--secur-financial--acme.aem.live',
  ]);
});

test('mapPath rewrites /en and home', () => {
  assert.equal(mapPath('/en/accounts', s, hosts), '/sites/my-bank/en/accounts');
  assert.equal(mapPath('/en', s, hosts), '/sites/my-bank/en');
  assert.equal(mapPath('/en/', s, hosts), '/sites/my-bank/en/');
  assert.equal(mapPath('/', s, hosts), '/sites/my-bank/');
  assert.equal(mapPath('/index', s, hosts), '/sites/my-bank/');
});

test('mapPath preserves query and hash', () => {
  assert.equal(mapPath('/en/loans?x=1#top', s, hosts), '/sites/my-bank/en/loans?x=1#top');
  assert.equal(mapPath('/#top', s, hosts), '/sites/my-bank/#top');
});

test('mapPath handles same-site absolute URLs (case-insensitive host)', () => {
  assert.equal(mapPath('https://main--secur-financial--acme.aem.page/en/accounts', s, hosts), '/sites/my-bank/en/accounts');
  assert.equal(mapPath('https://MAIN--secur-financial--acme.aem.live/', s, hosts), '/sites/my-bank/');
});

test('mapPath leaves other links unchanged (null)', () => {
  [
    'https://example.com/en/accounts',
    'https://main--other--acme.aem.page/en/x',
    'mailto:a@x.com',
    'tel:123',
    '#top',
    '/sites/my-bank/en/accounts',
    '/sites/other/en',
    '/data/multisite.json',
    '/drafts/x',
    '/english',
    'en/accounts',
    'https://content.da.live/acme/secur-financial/en/media.png',
  ].forEach((u) => assert.equal(mapPath(u, s, hosts), null, u));
});

test('rewriteLinks rewrites hrefs, keeps text', () => {
  const html = '<p>See /en/accounts</p><a href="/en/accounts">/en/accounts</a><a href="https://example.com/en">x</a><img src="/en/pic.png">';
  assert.equal(
    rewriteLinks(html, s, hosts),
    '<p>See /en/accounts</p><a href="/sites/my-bank/en/accounts">/en/accounts</a><a href="https://example.com/en">x</a><img src="/en/pic.png">',
  );
});

test('rewriteLinks rewrites nav/footer metadata values', () => {
  const html = '<div class="metadata"><div><div><p>nav</p></div><div><p>/en/nav</p></div></div>'
    + '<div><div>Footer</div><div>/en/footer</div></div>'
    + '<div><div><p>title</p></div><div><p>/en/nav</p></div></div></div>';
  assert.equal(
    rewriteLinks(html, s, hosts),
    '<div class="metadata"><div><div><p>nav</p></div><div><p>/sites/my-bank/en/nav</p></div></div>'
    + '<div><div>Footer</div><div>/sites/my-bank/en/footer</div></div>'
    + '<div><div><p>title</p></div><div><p>/en/nav</p></div></div></div>',
  );
});

test('rewriteLinks is idempotent', () => {
  const html = '<a href="/en/a">a</a><div><div><p>nav</p></div><div><p>/en/nav</p></div></div>';
  const once = rewriteLinks(html, s, hosts);
  assert.equal(rewriteLinks(once, s, hosts), once);
});
