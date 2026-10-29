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
3. `/data/testperm`: new row
   - `path` = `/sites/<slug>/ + **` (exactly: slash, space, `+`, space, `**`)
   - `groups` = users string
   - `actions` = `WRITE`
   - 4th column blank
4. Preview copied pages and `/data/multisite` (testperm is not previewed).

**Delete**: un-preview pages, remove the multisite row and the testperm row whose `path` is exactly `/sites/<slug>/ + **`, re-preview multisite, delete `/sites/<slug>`.

## Tests

```
npm test
```
