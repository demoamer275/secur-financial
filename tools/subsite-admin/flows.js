import {
  slugify,
  cleanUsers,
  permissionsPath,
  ensureSheet,
  getSheet,
  getHeaders,
  buildMultisiteRow,
  buildPermissionsRow,
  addRow,
  removeRows,
  hasRow,
  MULTISITE_DEFAULT_HEADERS,
  PERMISSIONS_DEFAULT_HEADERS,
  siteHosts,
  rewriteLinks,
} from './utils.js';
import {
  listFolder, copy, readSheet, writeSheet, deleteSource, crawlPages, preview, unpreview,
  readSource, writeSource, readConfig, writeConfig,
} from './api.js';

const MULTISITE = '/data/multisite';
const PERMISSIONS = 'permissions';

function sequence(items, fn) {
  return items.reduce((prev, item) => prev.then(() => fn(item)), Promise.resolve());
}

export async function listSites(ctx) {
  const items = await listFolder(ctx, '/sites');
  return items.filter((item) => !item.ext).map((item) => item.name);
}

// Re-reads the org config immediately before saving and changes only the permissions tab.
async function updatePermissions(ctx, mutate) {
  const config = await readConfig(ctx);
  const sheet = ensureSheet(config, PERMISSIONS);
  /* eslint-disable no-console */
  console.log('[SubSite Admin] permissions before:', structuredClone(sheet.data));
  mutate(sheet);
  console.log('[SubSite Admin] permissions after:', structuredClone(sheet.data));
  /* eslint-enable no-console */
  await writeConfig(ctx, config);
}

async function createSteps(ctx, slug, users, multisite, log, scriptURL) {
  log('Copying /index');
  await copy(ctx, '/index.html', `/sites/${slug}/index.html`);
  log('Copying /en');
  await copy(ctx, '/en', `/sites/${slug}/en`);

  log(`Adding row to ${MULTISITE}`);
  const msHeaders = getHeaders(getSheet(multisite), MULTISITE_DEFAULT_HEADERS);
  addRow(multisite, buildMultisiteRow(slug, msHeaders, scriptURL));
  await writeSheet(ctx, MULTISITE, multisite);

  log(`Adding row to org config ${PERMISSIONS}`);
  await updatePermissions(ctx, (sheet) => {
    const headers = getHeaders(sheet, PERMISSIONS_DEFAULT_HEADERS);
    addRow(sheet, buildPermissionsRow(ctx.repo, slug, users, headers));
  });

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

export async function createSite(ctx, siteName, usersInput, log, scriptInput = '') {
  const slug = slugify(siteName);
  if (!slug) throw new Error('Invalid site name');
  const users = cleanUsers(usersInput).trim();
  if (!users) throw new Error('Users required');
  const scriptURL = cleanUsers(scriptInput).trim();

  log(`Checking whether /sites/${slug} exists`);
  const existing = await listSites(ctx);
  const multisite = await readSheet(ctx, MULTISITE);
  if (existing.includes(slug) || hasRow(multisite, (r) => r.siteName === slug)) {
    throw new Error(`Site "${slug}" already exists`);
  }

  try {
    await createSteps(ctx, slug, users, multisite, log, scriptURL);
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

  log(`Removing row from org config ${PERMISSIONS}`);
  const path = permissionsPath(ctx.repo, slug);
  await updatePermissions(ctx, (sheet) => {
    removeRows(sheet, (r) => r.path === path);
  });

  log(`Deleting /sites/${slug}`);
  await deleteSource(ctx, `/sites/${slug}`);
  log('Done');
}
