# Deploying SECTOR-7 to GitHub Pages

The game is plain static files — **there is no build step**. `index.html` loads
`./styles/main.css`, `./src/main.js` and the vendored three.js via an import map, all with
relative paths, so it works from a project subpath (`/NOTIF/`) as-is.

## One-time setup (needs repo owner rights)

Pages cannot be switched on by a workflow; GitHub requires the owner to enable it once.

**Settings → Pages → Build and deployment**

| Option                             | What to do                                                                    | Result                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **GitHub Actions** _(recommended)_ | Source: **GitHub Actions**, then re-run the _Deploy to GitHub Pages_ workflow | `pages.yml` stages `index.html`, `styles/`, `src/`, `vendor/`, docs and publishes them |
| **Deploy from a branch**           | Source: **Deploy from a branch** → Branch `main`, folder `/ (root)` → Save    | GitHub serves the repo root directly; the workflow detects this and skips publishing   |

Either way the live site is:

**https://amirui123.github.io/NOTIF/**

First publish takes ~1 minute. To force a refresh afterwards: **Actions → Deploy to GitHub
Pages → Run workflow**.

## What gets published

```
index.html          the shell + import map
styles/main.css     all styling
src/**              the 19 game modules
vendor/three/**     three.js r170 (build + the 6 addons we use)
docs/favicon.svg    site icon
README.md FIXES.md LICENSE
```

`node_modules/`, `test/`, `scripts/` and `.github/` are **not** published.

## Verifying a deploy

```bash
curl -sI https://amirui123.github.io/NOTIF/            # 200 text/html
curl -sI https://amirui123.github.io/NOTIF/src/main.js # 200 text/javascript
```

A wrong `Content-Type` on `.js` is the classic Pages failure — it breaks ES modules. If you
see `text/plain`, wait for the first build to finish and hard-reload.

## Hosting elsewhere

Any static host works: Netlify, Cloudflare Pages, S3 + CloudFront, `npx serve .`, nginx.
Only two rules matter:

1. `.js` must be served as `text/javascript` (or `application/javascript`).
2. The site must be served over HTTP(S) — ES modules and import maps do not load from
   `file://`.
