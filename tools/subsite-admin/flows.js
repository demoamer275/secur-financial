import {
  slugify,
  cleanUsers,
  testpermPath,
  getSheet,
  getHeaders,
  buildMultisiteRow,
  buildTestpermRow,
  addRow,
  removeRows,
  hasRow,
  MULTISITE_DEFAULT_HEADERS,
  TESTPERM_DEFAULT_HEADERS,
  siteHosts,
  rewriteLinks,
} from './utils.js';
import {
  listFolder, copy, readSheet, writeSheet, deleteSource, crawlPages, preview, unpreview,
  readSource, writeSource,
} from './api.js';

const MULTISITE = '/data/multisite';
const TESTPERM = '/data/testperm';

function sequence(items, fn) {
  return items.reduce((prev, item) => prev.then(() => fn(item)), Promise.resolve());
}

export async function listSites(ctx) {
  const items = await listFolder(ctx, '/sites');
  return items.filter((item) => !item.ext).map((item) => item.name);
}

async function createSteps(ctx, slug, users, multisite, log) {
  log('Copying /index');
  await copy(ctx, '/index.html', `/sites/${slug}/index.html`);
  log('Copying /en');
  await copy(ctx, '/en', `/sites/${slug}/en`);

  log(`Adding row to ${MULTISITE}`);
  const msHeaders = getHeaders(getSheet(multisite), MULTISITE_DEFAULT_HEADERS);
  addRow(multisite, buildMultisiteRow(slug, msHeaders));
  await writeSheet(ctx, MULTISITE, multisite);

  log(`Adding row to ${TESTPERM}`);
  const testperm = await readSheet(ctx, TESTPERM);
  const tpHeaders = getHeaders(getSheet(testperm), TESTPERM_DEFAULT_HEADERS);
  addRow(testperm, buildTestpermRow(slug, users, tpHeaders));
  await writeSheet(ctx, TESTPERM, testperm);

  const pages = await crawlPages(ctx, `/sites/${slug}`);
  const hosts = siteHosts(ctx);
  await sequence(pages, async (page) => {
    const file = `${page}.html`;
    const html = await readSource(ctx, file);
    const updated = rewriteLinks(html, slug, hosts);
    if (updated === html) return;
    log(`Updating links in ${page}`);
    await writeSource(ctx, file, updated);
  });
  await sequence(pages, (page) => {
    log(`Previewing ${page}`);
    return preview(ctx, page);
  });
  log(`Previewing ${MULTISITE}`);
  await preview(ctx, `${MULTISITE}.json`);
}

export async function createSite(ctx, siteName, usersInput, log) {
  const slug = slugify(siteName);
  if (!slug) throw new Error('Invalid site name');
  const users = cleanUsers(usersInput).trim();
  if (!users) throw new Error('Users required');

  log(`Checking whether /sites/${slug} exists`);
  const existing = await listSites(ctx);
  const multisite = await readSheet(ctx, MULTISITE);
  if (existing.includes(slug) || hasRow(multisite, (r) => r.siteName === slug)) {
    throw new Error(`Site "${slug}" already exists`);
  }

  try {
    await createSteps(ctx, slug, users, multisite, log);
  } catch (e) {
    throw new Error(`${e.message}. Partial site "${slug}" may exist; use Delete to clean up before retrying.`);
  }
  log('Done');
  return slug;
}

export async function deleteSite(ctx, slug, log) {
  const pages = await crawlPages(ctx, `/sites/${slug}`);
  await sequence(pages, (page) => {
    log(`Removing preview ${page}`);
    return unpreview(ctx, page);
  });

  log(`Removing row from ${MULTISITE}`);
  const multisite = await readSheet(ctx, MULTISITE);
  removeRows(multisite, (r) => r.siteName === slug);
  await writeSheet(ctx, MULTISITE, multisite);
  log(`Previewing ${MULTISITE}`);
  await preview(ctx, `${MULTISITE}.json`);

  log(`Removing row from ${TESTPERM}`);
  const testperm = await readSheet(ctx, TESTPERM);
  const path = testpermPath(slug);
  removeRows(testperm, (r) => r.path === path);
  await writeSheet(ctx, TESTPERM, testperm);

  log(`Deleting /sites/${slug}`);
  await deleteSource(ctx, `/sites/${slug}`);
  log('Done');
}
