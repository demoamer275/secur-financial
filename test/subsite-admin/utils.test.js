import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  testpermPath,
  cleanUsers,
  getSheet,
  getHeaders,
  buildMultisiteRow,
  buildTestpermRow,
  addRow,
  removeRows,
  hasRow,
  MULTISITE_DEFAULT_HEADERS,
  TESTPERM_DEFAULT_HEADERS,
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

test('testpermPath exact format', () => {
  assert.equal(testpermPath('my-bank'), '/sites/my-bank/ + **');
});

test('cleanUsers strips line breaks', () => {
  assert.equal(cleanUsers('a@x.com,\r\nb@y.com,\nc@z.com'), 'a@x.com,b@y.com,c@z.com');
  assert.equal(cleanUsers('a@x.com, b@y.com'), 'a@x.com, b@y.com');
});

test('buildTestpermRow', () => {
  const users = 'a@x.com, b@y.com';
  assert.deepEqual(
    buildTestpermRow('my-bank', users, ['path', 'groups', 'actions', 'notes']),
    {
      path: '/sites/my-bank/ + **', groups: users, actions: 'WRITE', notes: '',
    },
  );
});

test('buildMultisiteRow blanks other columns', () => {
  assert.deepEqual(
    buildMultisiteRow('my-bank', ['siteName', 'title', 'theme']),
    { siteName: 'my-bank', title: '', theme: '' },
  );
});

test('getHeaders', () => {
  assert.deepEqual(getHeaders({ data: [] }, MULTISITE_DEFAULT_HEADERS), ['siteName']);
  assert.deepEqual(getHeaders({ data: [] }, TESTPERM_DEFAULT_HEADERS), ['path', 'groups', 'actions']);
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

test('removeRows testperm matches exact path only', () => {
  const json = {
    data: [
      { path: '/sites/my-bank/ + **' },
      { path: '/sites/my-bank/**' },
    ],
  };
  const { removed } = removeRows(json, (r) => r.path === testpermPath('my-bank'));
  assert.equal(removed, 1);
  assert.deepEqual(json.data, [{ path: '/sites/my-bank/**' }]);
});
