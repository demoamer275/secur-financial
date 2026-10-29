# SubSite Admin — Design Spec

Date: 2026-10-29
Status: Draft (awaiting review)

## Purpose

A DA (da.live) app that lets an admin create and delete "subsites" under `/sites/` in the current org/repo, keeping the `/data/multisite` and `/data/testperm` sheets in sync. Built per the AEM micro-frontend tutorial (https://www.aem.live/docs/ew/developing/micro-frontends/4-build-your-audit-app) using the DA Admin API (https://docs.da.live/developers/api).

## Inputs

- **Site name** (text). Converted to a slug (see below).
- **Users** (single-line text input). Label and placeholder tell the user it expects a comma-separated list (e.g. `user1@example.com, user2@example.com`). Line breaks (`\r`, `\n`) are stripped (removed); otherwise treated as a single opaque string (not parsed into an array) and written into the testperm `groups` column.

## Slug rule

1. Lowercase.
2. Replace each space with `-`.
3. Remove every character not in `[a-z0-9-]`.
4. Collapse runs of `-` into a single `-`.
5. Remove leading and trailing `-`.

Examples: `My Bank!` → `my-bank`; `  My  Bank ` → `my-bank`; `A - B` → `a-b`. Empty result → validation error, no action taken. "Site name" below always means the slug.

## Create flow

1. **Validate**: slug non-empty; users non-empty.
2. **Conflict check** (block on conflict, show error, do nothing):
   - `/sites/<slug>` exists in DA (`GET /list/{org}/{repo}/sites` contains `<slug>`), or
   - `/data/multisite` already has a row with `siteName === slug`.
3. **Copy content** (DA `POST /copy/{org}/{repo}/<src>` with form field `destination`):
   - `/index.html` → `/sites/<slug>/index.html`
   - `/en` → `/sites/<slug>/en` (recursive, includes everything under `en`)
4. **Update `/data/multisite`**: append row `{ siteName: <slug> }`; all other existing columns set to `""`.
5. **Update `/data/testperm`**: append row with:
   | column | value |
   |---|---|
   | 1st `path` | `/sites/<slug>/ + **` |
   | 2nd `groups` | the users string, verbatim |
   | 3rd `actions` | `write` (lowercase; updated 2026-10-29) |
   | 4th (whatever its header is) | `""` |

   **Critical:** `path` is exactly `/sites/<slug>/` followed by a space, a `+`, a space, and `**`. In code: `` `/sites/${slug}/ + **` ``. For `my-bank`: `/sites/my-bank/ + **`.
6. **Preview** (admin.hlx.page `POST /preview/{org}/{repo}/main/<path>`):
   - every page under `/sites/<slug>` (enumerated by crawling DA list; `.html` → path without extension),
   - `/data/multisite` (`.json`).
   - `/data/testperm` is **not** previewed.

## Delete flow

1. List folders under `/sites` (`GET /list/{org}/{repo}/sites`), each with a Delete button.
2. Confirmation dialog naming the slug.
3. On confirm:
   1. Crawl `/sites/<slug>` to collect page paths; un-preview each (`DELETE` admin.hlx.page `/preview/...`).
   2. Remove multisite row where `siteName === slug`; save; re-preview `/data/multisite`.
   3. Remove testperm row where `path === `/sites/<slug>/ + **`` (exact match); save. Not previewed.
   4. `DELETE /source/{org}/{repo}/sites/<slug>`.
4. Refresh list.

## Sheet read/write

- Read: `GET https://admin.da.live/source/{org}/{repo}/data/<name>.json`.
- Handle both shapes:
  - single sheet: `{ ":type": "sheet", data: [...], ... }`
  - multi sheet: `{ ":type": "multi-sheet", ":names": [...], <name>: { data: [...] } }` — operate on the first sheet in `:names`.
- Column order/headers taken from the first existing row's keys (or `columns` if present); new row includes every header key, unset ones as `""`.
- Write: `PUT` same URL with `multipart/form-data`, field `data` = JSON Blob (`application/json`), preserving all other properties.

## Auth & context

- `const { context, token } = await DA_SDK;` from `https://da.live/nx/utils/sdk.js`.
- `org`, `repo` from `context`. All requests send `Authorization: Bearer <token>` (DA and admin.hlx.page).

## Files

```
deps/lit/dist/index.js              vendored da-lit bundle
tools/subsite-admin/subsite-admin.html
tools/subsite-admin/subsite-admin.js   Lit component <subsite-admin> (Create + Delete sections)
tools/subsite-admin/subsite-admin.css
tools/subsite-admin/utils.js           pure: slugify, buildMultisiteRow, buildTestpermRow, testpermPath, addRow, removeRows, getSheetData/setSheetData
tools/subsite-admin/api.js             DA + admin.hlx.page calls
test/subsite-admin/utils.test.js       unit tests
```

Styles loaded as constructable stylesheet into the shadow root (tutorial pattern), implemented locally since `scripts/utils/styles.js` does not exist here.

## Error handling & status

- Step-by-step status log in the UI.
- Stop at first failed step; report which steps completed and the failing HTTP status. No automatic rollback.
- Buttons disabled while an operation runs.

## Testing

- Unit tests (required):
  - `slugify('My Bank!') === 'my-bank'`, multiple spaces, digits, empty → `''`.
  - `buildTestpermRow('my-bank', 'a@x.com, b@y.com', headers)` → `{ path: '/sites/my-bank/ + **', groups: 'a@x.com, b@y.com', actions: 'WRITE', <4th>: '' }`.
  - `testpermPath('my-bank') === '/sites/my-bank/ + **'`.
  - add/remove row for single and multi-sheet shapes; remove matches exactly.
- Manual: `https://da.live/app/{org}/{repo}/tools/subsite-admin/subsite-admin?ref=local`.

## Registration

Add to site config `apps` tab:

| title | description | image | path | ref |
|---|---|---|---|---|
| SubSite Admin | Create and delete subsites | | `/app/{org}/{repo}/tools/subsite-admin/subsite-admin?ref=local` | local |

## Link rewriting (create flow, after copy, before preview)

For every `.html` page under `/sites/<slug>` (from `crawlPages`): `GET /source/...html`, apply `rewriteLinks(html, slug, hosts)`, `PUT` back (multipart `data`, `text/html`) only if changed. Data sheets (`.json`) are ignored.

`hosts` = `main--{repo}--{org}.aem.page`, `main--{repo}--{org}.aem.live` (case-insensitive). No production domain.

`mapPath(url)` for a link target:
- Absolute URL on one of `hosts` → use its path (result is site-relative); other absolute URLs, `mailto:`, `tel:`, `#…` → unchanged.
- Path already under `/sites/` → unchanged (idempotent).
- `/` or `/index` → `/sites/<slug>/`.
- `/en` or `/en/...` → `/sites/<slug>` + path.
- Anything else (e.g. `/data/...`, `/drafts/...`) → unchanged.
- `?query` / `#hash` suffix preserved.

Applied to: every `href="..."` attribute, and the value cell of `nav` / `footer` rows in the metadata block. Plain body text is never changed.

## Out of scope

> **Update 2026-10-29:** `/data/testperm` is replaced by the org-level DA config (`GET`/`POST https://admin.da.live/config/{org}/`, form field `config` = JSON string), tab `permissions`. Same columns/values, except `path` = `/<repo>/sites/<slug>/ + **`. Config is re-read immediately before each save, only the `permissions` tab is modified (created if missing), and before/after rows are logged to the console. Existing testperm rows are not touched.

- Rollback of partial operations.
- Publishing to live.
- Parsing/validating individual users.
