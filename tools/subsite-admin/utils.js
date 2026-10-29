export const MULTISITE_DEFAULT_HEADERS = ['siteName'];
export const TESTPERM_DEFAULT_HEADERS = ['path', 'groups', 'actions'];

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function testpermPath(slug) {
  return `/sites/${slug}/ + **`;
}

export function cleanUsers(users) {
  return String(users).replace(/[\r\n]/g, '');
}

export function getSheet(json) {
  const sheet = json[':type'] === 'multi-sheet' ? json[json[':names'][0]] : json;
  if (!Array.isArray(sheet.data)) sheet.data = [];
  return sheet;
}

export function getHeaders(sheet, fallback) {
  if (Array.isArray(sheet.columns) && sheet.columns.length) return sheet.columns;
  if (sheet.data?.length) return Object.keys(sheet.data[0]);
  return fallback;
}

function buildRow(headers, values) {
  const row = Object.fromEntries(headers.map((h) => [h, '']));
  return { ...row, ...values };
}

export function buildMultisiteRow(slug, headers) {
  return buildRow(headers, { siteName: slug });
}

export function buildTestpermRow(slug, users, headers) {
  return buildRow(headers, { path: testpermPath(slug), groups: users, actions: 'WRITE' });
}

function syncCounts(sheet) {
  if ('total' in sheet) sheet.total = sheet.data.length;
  if ('limit' in sheet) sheet.limit = sheet.data.length;
}

export function addRow(json, row) {
  const sheet = getSheet(json);
  sheet.data.push(row);
  syncCounts(sheet);
  return json;
}

export function removeRows(json, predicate) {
  const sheet = getSheet(json);
  const before = sheet.data.length;
  sheet.data = sheet.data.filter((row) => !predicate(row));
  syncCounts(sheet);
  return { json, removed: before - sheet.data.length };
}

export function hasRow(json, predicate) {
  return getSheet(json).data.some(predicate);
}
