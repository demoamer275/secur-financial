import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  permissionsPath,
  ensureSheet,
  cleanUsers,
  getSheet,
  getHeaders,
  buildMultisiteRow,
  buildPermissionsRow,
  addRow,
  removeRows,
  hasRow,
  MULTISITE_DEFAULT_HEADERS,
  PERMISSIONS_DEFAULT_HEADERS,
} from '../../tools/subsite-admin/utils.js';

test('slugify', () => {
  assert.equal(slugify('My Bank!'), 'my-bank');
  assert.equal(slugify('ACME Corp 2'), 'acme-corp-2');
  assert.equal(slugify('  My  Bank '), 'my-bank');
  assert.equal(slugify('A - B'), 'a-b');
  assert.equal(slugify('-x-'), 'x');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('Café_Site'), 'cafsite');
});

test('permissionsPath exact format', () => {
  assert.equal(permissionsPath('secur-financial', 'my-bank'), '/secur-financial/sites/my-bank/ + **');
});

test('ensureSheet returns existing tab or adds one', () => {
  const cfg = { ':type': 'multi-sheet', ':names': ['data'], data: { data: [] } };
  const sheet = ensureSheet(cfg, 'permissions');
  assert.deepEqual(cfg[':names'], ['data', 'permissions']);
  assert.deepEqual(sheet, { data: [] });
  assert.equal(cfg.permissions, sheet);
  assert.equal(ensureSheet(cfg, 'permissions'), sheet);
  assert.deepEqual(cfg[':names'], ['data', 'permissions']);
  const noNames = {};
  ensureSheet(noNames, 'permissions');
  assert.deepEqual(noNames[':names'], ['permissions']);
  assert.equal(noNames[':type'], 'multi-sheet');
});

test('cleanUsers strips line breaks', () => {
  assert.equal(cleanUsers('a@x.com,\r\nb@y.com,\nc@z.com'), 'a@x.com,b@y.com,c@z.com');
  assert.equal(cleanUsers('a@x.com, b@y.com'), 'a@x.com, b@y.com');
});

test('buildPermissionsRow', () => {
  const users = 'a@x.com, b@y.com';
  assert.deepEqual(
    buildPermissionsRow('r', 'my-bank', users, ['path', 'groups', 'actions', 'comments']),
    {
      path: '/r/sites/my-bank/ + **', groups: users, actions: 'write', comments: '',
    },
  );
});

test('buildMultisiteRow blanks other columns', () => {
  assert.deepEqual(
    buildMultisiteRow('my-bank', ['siteName', 'title', 'theme']),
    { siteName: 'my-bank', title: '', theme: '' },
  );
});

test('buildMultisiteRow sets scriptURL', () => {
  assert.deepEqual(
    buildMultisiteRow('my-bank', ['siteName', 'scriptURL', 'theme'], 'https://x.com/launch.js'),
    { siteName: 'my-bank', scriptURL: 'https://x.com/launch.js', theme: '' },
  );
  assert.deepEqual(
    buildMultisiteRow('my-bank', ['siteName'], 'https://x.com/launch.js'),
    { siteName: 'my-bank', scriptURL: 'https://x.com/launch.js' },
  );
  assert.deepEqual(buildMultisiteRow('my-bank', ['siteName', 'scriptURL'], ''), { siteName: 'my-bank', scriptURL: '' });
});

test('getHeaders', () => {
  assert.deepEqual(getHeaders({ data: [] }, MULTISITE_DEFAULT_HEADERS), ['siteName']);
  assert.deepEqual(getHeaders({ data: [] }, PERMISSIONS_DEFAULT_HEADERS), ['path', 'groups', 'actions']);
  assert.deepEqual(getHeaders({ columns: ['a', 'b'], data: [] }, ['x']), ['a', 'b']);
  assert.deepEqual(getHeaders({ data: [{ p: '1', q: '' }] }, ['x']), ['p', 'q']);
});

test('addRow/removeRows/hasRow single sheet', () => {
  const json = {
    ':type': 'sheet', total: 1, limit: 1, offset: 0, data: [{ siteName: 'a' }],
  };
  addRow(json, { siteName: 'b' });
  assert.equal(json.data.length, 2);
  assert.equal(json.total, 2);
  assert.equal(json.limit, 2);
  assert.ok(hasRow(json, (r) => r.siteName === 'b'));
  const { removed } = removeRows(json, (r) => r.siteName === 'b');
  assert.equal(removed, 1);
  assert.equal(json.total, 1);
  assert.ok(!hasRow(json, (r) => r.siteName === 'b'));
  assert.equal(removeRows(json, (r) => r.siteName === 'zzz').removed, 0);
});

test('addRow/removeRows multi-sheet operates on first :names sheet', () => {
  const json = {
    ':type': 'multi-sheet',
    ':names': ['data', 'other'],
    data: { total: 0, data: [] },
    other: { total: 1, data: [{ siteName: 'keep' }] },
  };
  assert.equal(getSheet(json), json.data);
  addRow(json, { siteName: 'x' });
  assert.deepEqual(json.data.data, [{ siteName: 'x' }]);
  assert.equal(json.data.total, 1);
  removeRows(json, (r) => r.siteName === 'x');
  assert.deepEqual(json.data.data, []);
  assert.deepEqual(json.other.data, [{ siteName: 'keep' }]);
});

test('getSheet handles missing data array', () => {
  const json = { ':type': 'sheet' };
  addRow(json, { siteName: 'x' });
  assert.deepEqual(json.data, [{ siteName: 'x' }]);
});

test('removeRows permissions matches exact path only', () => {
  const json = {
    data: [
      { path: '/r/sites/my-bank/ + **' },
      { path: '/r/sites/my-bank/**' },
    ],
  };
  const { removed } = removeRows(json, (r) => r.path === permissionsPath('r', 'my-bank'));
  assert.equal(removed, 1);
  assert.deepEqual(json.data, [{ path: '/r/sites/my-bank/**' }]);
});
