# SubSite Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A da.live app that creates/deletes subsites under `/sites/<slug>` and keeps `/data/multisite` and `/data/testperm` in sync.

**Architecture:** Lit web component loaded by a DA app HTML page (tutorial pattern). Pure logic in `utils.js` (unit-tested with `node:test`), network calls in `api.js` (fetch wrappers taking `{ org, repo, token }`), orchestration + UI in `subsite-admin.js`.

**Tech Stack:** Vanilla ES modules, Lit (vendored as `da-lit` at `/deps/lit/dist/index.js`), DA SDK (`https://da.live/nx/utils/sdk.js`), DA Admin API (`https://admin.da.live`), AEM Admin API (`https://admin.hlx.page`), Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-29-subsite-admin-design.md`

## Global Constraints

- testperm `path` value is exactly `` `/sites/${slug}/ + **` `` — slash, space, `+`, space, `**`. Never `/sites/<slug>/**`.
- testperm `groups` = users input with line breaks (`\r`, `\n`) removed; otherwise verbatim (no split/parse). `actions` = `WRITE`. 4th column = `""`.
- Users field: single-line `<input>` labelled `Users (comma-separated)`, placeholder `user1@example.com, user2@example.com`.
- multisite new row: `siteName` = slug; every other column `""`.
- Slug: lowercase → each space to `-` → strip chars not in `[a-z0-9-]` → collapse `-+` to `-` → trim leading/trailing `-`. Empty slug = error.
- Create blocks if `/sites/<slug>` exists or multisite has `siteName === slug`.
- Preview copied pages + `/data/multisite`. Never preview `/data/testperm`.
- Delete: un-preview pages, remove rows, re-preview multisite, then `DELETE` source folder.
- Stop at first failure; no rollback. All requests send `Authorization: Bearer <token>`.
- Code style: airbnb-base ESLint (`npm run lint:js` must pass for new files).

## Review Focus

- Users pasted with newlines → newlines removed, commas kept (Task 2 `cleanUsers`).
- Site name with only symbols (`"!!!"`) → empty slug, create rejected before any network call (Task 2 + Task 5).
- Consecutive / leading / trailing spaces or dashes (`"  My  Bank "`, `"A - B"`) → `my-bank`, `a-b` (Task 2).
- Sheet with no rows yet → headers must come from `columns` or fall back to spec defaults (`siteName`; `path, groups, actions` + none) rather than producing `{}` (Task 2).
- Delete of a slug whose rows are missing from a sheet → still proceeds, removes nothing, no error (Task 2 `removeRows` test, Task 5 flow).

---

## File Structure

```
deps/lit/dist/index.js                  vendored da-lit (Task 1)
tools/subsite-admin/subsite-admin.html  app shell (Task 1)
tools/subsite-admin/subsite-admin.css   styles (Task 5)
tools/subsite-admin/utils.js            pure helpers (Task 2)
tools/subsite-admin/api.js              DA + admin.hlx.page calls (Tasks 3-4)
tools/subsite-admin/subsite-admin.js    Lit component + flows (Task 5)
test/subsite-admin/utils.test.js        unit tests (Task 2)
test/subsite-admin/api.test.js          fetch-mocked tests (Tasks 3-4)
package.json                            add "test" script (Task 2)
```

---

### Task 1: Vendor Lit + app shell

**Files:**
- Create: `deps/lit/dist/index.js`
- Create: `tools/subsite-admin/subsite-admin.html`
- Modify: `.eslintignore` (add `deps/`)

**Interfaces:**
- Produces: importmap `"da-lit": "/deps/lit/dist/index.js"`; page loads `/tools/subsite-admin/subsite-admin.js` as module.

- [ ] **Step 1:** Download the da-lit bundle: `Invoke-WebRequest https://raw.githubusercontent.com/adobe/da-live/main/deps/lit/dist/index.js -OutFile deps/lit/dist/index.js` (create dir first). If that URL 404s, use `https://da.live/deps/lit/dist/index.js`. Verify the file exports `LitElement`, `html`, `nothing` (`Select-String -Path deps/lit/dist/index.js -Pattern 'LitElement'`).
- [ ] **Step 2:** Write `subsite-admin.html` identical to the tutorial HTML with title `SubSite Admin` and script `/tools/subsite-admin/subsite-admin.js`.
- [ ] **Step 3:** Add `deps/` to `.eslintignore`; run `npm run lint:js` → no errors from deps.
- [ ] **Step 4:** Commit `feat(subsite-admin): vendor lit and add app shell`.

---

### Task 2: Pure helpers (`utils.js`)

**Files:**
- Create: `tools/subsite-admin/utils.js`
- Create: `test/subsite-admin/utils.test.js`
- Modify: `package.json` — add `"test": "node --test test/"`

**Interfaces:**
- Produces:
  - `slugify(name: string) => string`
  - `testpermPath(slug: string) => string`
  - `cleanUsers(users: string) => string` — removes every `\r` and `\n`.
  - `getSheet(json: object) => { data: object[], columns?: string[] }` — returns the sheet object (single: `json`; multi-sheet: `json[json[':names'][0]]`). Mutating it mutates `json`.
  - `getHeaders(sheet, fallback: string[]) => string[]` — `sheet.columns` if present, else keys of `sheet.data[0]`, else `fallback`.
  - `buildMultisiteRow(slug, headers) => object`
  - `buildTestpermRow(slug, users, headers) => object`
  - `addRow(json, row) => json` — pushes to `getSheet(json).data`, updates `:total`/`total`/`limit` counts if present.
  - `removeRows(json, predicate: (row) => boolean) => { json, removed: number }`
  - `hasRow(json, predicate) => boolean`
  - Constants: `MULTISITE_DEFAULT_HEADERS = ['siteName']`, `TESTPERM_DEFAULT_HEADERS = ['path', 'groups', 'actions']`.

- [ ] **Step 1: Write failing tests** (`node:test` + `node:assert/strict`):

```js
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
});
test('buildTestpermRow', () => {
  const users = 'a@x.com, b@y.com';
  assert.deepEqual(
    buildTestpermRow('my-bank', users, ['path', 'groups', 'actions', 'notes']),
    { path: '/sites/my-bank/ + **', groups: users, actions: 'WRITE', notes: '' },
  );
});
test('buildMultisiteRow blanks other columns', () => {
  assert.deepEqual(buildMultisiteRow('my-bank', ['siteName', 'title', 'theme']),
    { siteName: 'my-bank', title: '', theme: '' });
});
test('getHeaders falls back when sheet empty', () => {
  assert.deepEqual(getHeaders({ data: [] }, ['siteName']), ['siteName']);
});
test('addRow/removeRows/hasRow single sheet', () => { /* add, hasRow true, remove → removed 1, hasRow false; remove missing → removed 0 */ });
test('addRow/removeRows multi-sheet operates on first :names sheet', () => { /* json = {':type':'multi-sheet',':names':['data'],data:{data:[...]}} */ });
test('removeRows testperm matches exact path only', () => {
  // rows '/sites/my-bank/ + **' and '/sites/my-bank/**' → only the first removed
});
```

- [ ] **Step 2:** `npm test` → FAIL (module not found).
- [ ] **Step 3:** Implement exports above. `slugify`: `name.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')`. Rows are built by mapping every header to `''` then setting the known keys; known keys missing from headers are still included.
- [ ] **Step 4:** `npm test` → all PASS; `npm run lint:js` clean.
- [ ] **Step 5:** Commit `feat(subsite-admin): pure helpers with tests`.

---

### Task 3: DA API wrapper (`api.js` — DA part)

**Files:**
- Create: `tools/subsite-admin/api.js`
- Create: `test/subsite-admin/api.test.js` (mock `globalThis.fetch`)

**Interfaces:**
- Consumes: none.
- Produces (all `async`, throw `Error(\`${method} ${url} failed: ${status}\`)` on `!resp.ok`; `ctx = { org, repo, token }`; paths begin with `/`):
  - `listFolder(ctx, path) => Array<{ name, path, ext? }>` — `GET https://admin.da.live/list/{org}/{repo}{path}`; returns `[]` on 404.
  - `copy(ctx, src, dest)` — `POST https://admin.da.live/copy/{org}/{repo}{src}`, body `FormData` with `destination` = `/{org}/{repo}{dest}`.
  - `readSheet(ctx, path) => object` — `GET https://admin.da.live/source/{org}/{repo}{path}.json`.
  - `writeSheet(ctx, path, json)` — `PUT` same URL, `FormData` field `data` = `new Blob([JSON.stringify(json)], { type: 'application/json' })`.
  - `deleteSource(ctx, path)` — `DELETE https://admin.da.live/source/{org}/{repo}{path}`.
  - `crawlPages(ctx, path) => string[]` — recursive via `listFolder`; returns web paths of `.html` items without extension, path relative to repo (e.g. `/sites/my-bank/en/loans`); `index` stays as `/sites/my-bank/index`.

- [ ] **Step 1: Failing tests:** each function hits the exact URL + method + `Authorization: Bearer t`; `copy` sends `destination=/o/r/sites/x/en`; `writeSheet` sends field `data` whose text parses back to the input; `listFolder` 404 → `[]`; 500 → throws; `crawlPages` over a mocked two-level tree returns `['/sites/x/index', '/sites/x/en/a']` and skips non-html.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. DA list items: entries with `ext` are files (`path` like `/o/r/sites/x/en/a.html`); entries without `ext` are folders. Strip `/{org}/{repo}` prefix and `.html`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(subsite-admin): DA api wrapper`.

---

### Task 4: AEM preview wrapper (`api.js` — admin.hlx.page part)

**Files:**
- Modify: `tools/subsite-admin/api.js`
- Modify: `test/subsite-admin/api.test.js`

**Interfaces:**
- Produces:
  - `preview(ctx, webPath)` — `POST https://admin.hlx.page/preview/{org}/{repo}/main{webPath}`.
  - `unpreview(ctx, webPath)` — `DELETE` same URL; treat 404 as success.
  - Sheet web path is `/data/multisite` (no `.json`); page paths from `crawlPages`. `/sites/x/index` → previewed as `/sites/x/` (strip trailing `index`).

- [ ] **Step 1: Failing tests:** exact URLs/methods/auth header; `index` normalization; unpreview 404 resolves.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(subsite-admin): preview/unpreview`.

---

### Task 5: Lit component, flows, styles

**Files:**
- Create: `tools/subsite-admin/subsite-admin.js`
- Create: `tools/subsite-admin/subsite-admin.css`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: custom element `<subsite-admin>` with properties `ctx` (`{ org, repo, token }`); exported `createSite(ctx, siteName, users, log)` and `deleteSite(ctx, slug, log)` where `log(msg: string)` reports progress.

- [ ] **Step 1: `createSite`** — order exactly:
  1. `slug = slugify(siteName)`; empty → throw `Invalid site name`. `users = cleanUsers(users)`; empty after trim → throw `Users required`.
  2. `listFolder(ctx,'/sites')` contains `name === slug` → throw `Site "<slug>" already exists`. `readSheet('/data/multisite')` `hasRow(siteName===slug)` → same error.
  3. `copy('/index.html', '/sites/<slug>/index.html')`; `copy('/en', '/sites/<slug>/en')`.
  4. multisite: `addRow(json, buildMultisiteRow(slug, getHeaders(getSheet(json), MULTISITE_DEFAULT_HEADERS)))`, `writeSheet`.
  5. testperm: same with `buildTestpermRow(slug, users, …TESTPERM_DEFAULT_HEADERS)`, `writeSheet`.
  6. `crawlPages('/sites/<slug>')` → `preview` each sequentially; `preview('/data/multisite')`. No testperm preview.
  `log` a line before each step and `Done` at end.
- [ ] **Step 2: `deleteSite`** — `crawlPages` → `unpreview` each; multisite `removeRows(siteName===slug)` + write + `preview('/data/multisite')`; testperm `removeRows(path === testpermPath(slug))` + write; `deleteSource('/sites/<slug>')`.
- [ ] **Step 3: Component** — tutorial pattern (`adoptedStyleSheets` from a `CSSStyleSheet` built from `fetch(new URL('./subsite-admin.css', import.meta.url))`). Sections:
  - **Create Site**: inputs *Site name*, *Users (comma-separated)* (single-line `<input>`, placeholder `user1@example.com, user2@example.com`); live preview line `Folder: /sites/<slug>`; *Create* button.
  - **Delete Site**: list from `listFolder('/sites')` (folders only), each with *Delete* → `confirm(\`Delete /sites/${slug} and its sheet rows?\`)`.
  - Status log `<ul>`; buttons disabled while `_busy`; errors shown in red; list refreshes after create/delete.
  - `init()` as in tutorial: `const { context, token } = await DA_SDK;` → `cmp.ctx = { org: context.org, repo: context.repo, token }`.
- [ ] **Step 4:** `npm run lint:js` clean; `npm test` still PASS.
- [ ] **Step 5: Manual verification** (`aem up` running, open `https://da.live/app/{org}/{repo}/tools/subsite-admin/subsite-admin?ref=local`):
  - Create `My Bank!` with users `a@x.com, b@y.com` → `/sites/my-bank/index` + `/sites/my-bank/en/**` exist; multisite has `my-bank`; testperm row path displays exactly `/sites/my-bank/ + **`, groups `a@x.com, b@y.com`, actions `WRITE`, 4th blank; `https://main--{repo}--{org}.aem.page/sites/my-bank/` loads; testperm not previewed.
  - Create `my bank` again → blocked with exists error, nothing changed.
  - Create `!!!` → `Invalid site name`, no network calls.
  - Delete `my-bank` → folder gone, both rows gone, preview URL 404.
- [ ] **Step 6:** Commit `feat(subsite-admin): UI and create/delete flows`.

---

### Task 6: Registration docs

**Files:**
- Create: `tools/subsite-admin/README.md`

- [ ] **Step 1:** Document the site config `apps` row (title `SubSite Admin`, description `Create and delete subsites`, path `/app/{org}/{repo}/tools/subsite-admin/subsite-admin?ref=local`, ref `local`), and the exact testperm format.
- [ ] **Step 2:** Commit `docs(subsite-admin): registration`.
