# SubSite Admin

DA app for creating and deleting subsites under `/sites/`.

## Run locally

```
aem up
```

Open `https://da.live/app/{org}/{repo}/tools/subsite-admin/subsite-admin?ref=local`.

## Register

In the site config sheet, add an **apps** tab row:

| title | description | image | path | ref |
|---|---|---|---|---|
| SubSite Admin | Create and delete subsites | | `/app/{org}/{repo}/tools/subsite-admin/subsite-admin?ref=local` | local |

## What it does

Site name → slug: lowercase, spaces → `-`, strip non `[a-z0-9-]`, collapse repeated `-`, trim leading/trailing `-`.
Users: comma-separated list, line breaks removed, stored as a single string.

**Create** (blocked if `/sites/<slug>` or a multisite row already exists):

1. Copy `/index` → `/sites/<slug>/index` and `/en/**` → `/sites/<slug>/en/**`.
2. `/data/multisite`: new row `siteName = <slug>`, other columns blank.
3. Org config (`https://admin.da.live/config/{org}/`) `permissions` tab: new row
   - `path` = `/<repo>/sites/<slug>/ + **` (exactly: slash, space, `+`, space, `**`)
   - `groups` = users string
   - `actions` = `write` (lowercase)
   - 4th column blank

   The config is re-read just before saving; only the `permissions` tab changes. Its rows before/after are logged to the browser console. `/data/testperm` is no longer used.
4. Rewrite links in every copied page (data sheets are ignored), saving only pages that change:
   - `href`s and `nav`/`footer` metadata values pointing to `/en/...` → `/sites/<slug>/en/...`; `/` or `/index` → `/sites/<slug>/`.
   - Same applies to absolute `https://main--{repo}--{org}.aem.page|aem.live/...` links (made site-relative).
   - Other links (external, `/data/...`, `/drafts/...`, already `/sites/...`, media) and body text are untouched.
5. Preview copied pages and `/data/multisite` (the org config is not previewed).

**Delete**: un-preview pages, remove the multisite row, re-preview multisite, remove the org config `permissions` row whose `path` is exactly `/<repo>/sites/<slug>/ + **`, delete `/sites/<slug>`.

## Tests

```
npm test
```
