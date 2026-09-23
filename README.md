# Scalient IQ website

This repository contains the Scalient IQ website at `scalientiq.com`. It is a collection of standalone HTML pages, static assets, and a small set of Vercel serverless functions. There is no application framework, package manifest, or build step in the repository.

## Architecture

```text
Browser
  ├─ Static HTML, CSS, images, and connectors.json
  ├─ Third-party forms, lead workflows, and analytics
  └─ /api/* (Vercel functions)
       ├─ Passphrase-checked client reports and runbook
       ├─ Runbook save via the GitHub Contents API
       └─ First-party pageview collection via Airtable
```

- Most public pages are self-contained HTML files in the repository root. The main marketing pages use `styles.css`; the home page and many report and tool pages also have page-specific inline CSS and JavaScript. Navigation and footers are repeated in the HTML rather than generated from a shared template.
- `connectors.html` loads the public `connectors.json` directory and logo assets from `logos/`. Other images, SVGs, and social-preview assets live at the root or in `img/`.
- `api/` contains Node.js Vercel functions. `api/_data/index.js` bundles client runbook and evidence data for authenticated reads. `api/_stackhealth-index.js` bundles dated Stack Health packs. The underscore-prefixed API data files are intended to be server-side data, not public pages.
- `middleware.js` blocks direct requests for client JSON under `clients/<slug>/`; `vercel.json` also rewrites the client config URL to `api/blocked.js` and defines legacy redirects. Client report pages should request sensitive data through the passphrase-checked API routes, not embed it in HTML.
- The pages use external services directly: the contact form posts to Formspree, the readiness and intake flows post to n8n, and analytics include HubSpot, Apollo/Leadpipe on some pages, and the first-party `/api/e` beacon. `/api/e` forwards pageview data to Airtable when its environment variables are configured.

### Client data flow

| Page | API route | Source |
| --- | --- | --- |
| `runbook.html?c=<slug>` | `POST /api/get-runbook` | Bundled `clients/<slug>/config.json`, with an optional live GitHub copy when `GITHUB_PAT` works |
| `evidence-romify.html` | `POST /api/get-evidence` | Bundled register and dated evidence in `api/_data/` |
| `stack-health.html?c=<slug>&asof=<YYYY-MM-DD>` | `POST /api/get-stack-health` | Dated packs registered in `api/_stackhealth-index.js` |

These read routes validate a passphrase on the server. `POST /api/save-runbook` is an admin-only write path that commits a runbook config through the GitHub Contents API. It requires `ADMIN_PASS_HASH` and `GITHUB_PAT`. `ADMIN_PASS_HASH` is optional for the read routes; without it, the admin override is unavailable. The public HTML for other client-specific reports is committed as static pages, so do not assume that a page is private solely because it has a report title or a browser-side gate.

## Site layout

| Area | Pages and role |
| --- | --- |
| Home and company | `index.html` is the landing page; `about.html`, `solutions.html`, `results.html`, `trust.html`, and `contact.html` cover the company, offering, proof, security, and contact flow. |
| Discovery tools | `connectors.html` is the connector directory; `gtm-readiness.html` and `dark-stack.html` are interactive tools; `assessment.html` explains the GTM Signal Assessment. |
| Editorial and policy | `insights.html` links to article pages such as `the-baseline-nobody-handed-you.html`; `privacy.html` and `terms.html` are policy pages. `llms.txt`, `robots.txt`, and `sitemap.xml` serve discovery metadata. |
| Client workflow | `client-intake.html` collects onboarding inputs. `runbook.html`, `evidence-romify.html`, and `stack-health.html` fetch data from the API after a passphrase check. |
| Reports and examples | Root-level `*-romify.html` pages, `aeo-report-coinflow.html`, `marketing-signal-assessment.html`, and `stack-health-acme.html` are standalone client, sample, or report pages. |

The primary marketing navigation links to About, Solutions, Connectors, Assessment, Results, Insights, and Trust, with Contact as a call to action. The home page also links to the readiness and Dark Stack tools. Some client and report pages use their own layout rather than the shared marketing stylesheet.

## Working locally

Serve the repository root with a static server for public pages, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. This previews HTML, CSS, images, and `connectors.json`. The `/api/*` routes and Vercel middleware need a Vercel-compatible local runtime or a deployment, so passphrase-checked reports will not fully work through the Python server. The repository has no package install or build command.

When adding a marketing page, update the relevant navigation links, `sitemap.xml` when the page should be indexed, and any shared styling in `styles.css`. When adding a client data snapshot, update the corresponding server-side index (`api/_data/index.js` or `api/_stackhealth-index.js`) and keep sensitive payloads out of static HTML.
