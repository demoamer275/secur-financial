const DA = 'https://admin.da.live';
const AEM = 'https://admin.hlx.page';

async function request(ctx, method, url, { body, ok = [] } = {}) {
  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${ctx.token}` },
    body,
  });
  if (!resp.ok && !ok.includes(resp.status)) {
    throw new Error(`${method} ${url} failed: ${resp.status}`);
  }
  return resp;
}

export async function listFolder(ctx, path) {
  const resp = await request(ctx, 'GET', `${DA}/list/${ctx.org}/${ctx.repo}${path}`, { ok: [404] });
  if (resp.status === 404) return [];
  return resp.json();
}

export async function copy(ctx, src, dest) {
  const body = new FormData();
  body.append('destination', `/${ctx.org}/${ctx.repo}${dest}`);
  await request(ctx, 'POST', `${DA}/copy/${ctx.org}/${ctx.repo}${src}`, { body });
}

export async function readSheet(ctx, path) {
  const resp = await request(ctx, 'GET', `${DA}/source/${ctx.org}/${ctx.repo}${path}.json`);
  return resp.json();
}

export async function writeSheet(ctx, path, json) {
  const body = new FormData();
  body.append('data', new Blob([JSON.stringify(json)], { type: 'application/json' }));
  await request(ctx, 'PUT', `${DA}/source/${ctx.org}/${ctx.repo}${path}.json`, { body });
}

export async function readSource(ctx, path) {
  const resp = await request(ctx, 'GET', `${DA}/source/${ctx.org}/${ctx.repo}${path}`);
  return resp.text();
}

export async function writeSource(ctx, path, html) {
  const body = new FormData();
  body.append('data', new Blob([html], { type: 'text/html' }));
  await request(ctx, 'PUT', `${DA}/source/${ctx.org}/${ctx.repo}${path}`, { body });
}

export async function readConfig(ctx) {
  const resp = await request(ctx, 'GET', `${DA}/config/${ctx.org}/`);
  return resp.json();
}

export async function writeConfig(ctx, json) {
  const body = new FormData();
  body.append('config', JSON.stringify(json));
  await request(ctx, 'POST', `${DA}/config/${ctx.org}/`, { body });
}

export async function deleteSource(ctx, path) {
  await request(ctx, 'DELETE', `${DA}/source/${ctx.org}/${ctx.repo}${path}`);
}

export async function crawlPages(ctx, path) {
  const prefix = `/${ctx.org}/${ctx.repo}`;
  const items = await listFolder(ctx, path);
  const nested = await Promise.all(items.map(async (item) => {
    const repoPath = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path;
    if (!item.ext) return crawlPages(ctx, repoPath);
    if (item.ext === 'html') return [repoPath.replace(/\.html$/, '')];
    return [];
  }));
  return nested.flat();
}

function previewUrl(ctx, webPath) {
  const path = webPath.replace(/\/index$/, '/');
  return `${AEM}/preview/${ctx.org}/${ctx.repo}/main${path}`;
}

export async function preview(ctx, webPath) {
  await request(ctx, 'POST', previewUrl(ctx, webPath));
}

export async function unpreview(ctx, webPath) {
  await request(ctx, 'DELETE', previewUrl(ctx, webPath), { ok: [404] });
}
