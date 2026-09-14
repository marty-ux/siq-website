/**
 * Vercel serverless function - /api/get-runbook
 *
 * POST body: { slug, passphrase }
 *
 * Validates passphrase against:
 *   1. Admin hash (sha256 of the passphrase, from the ADMIN_PASS_HASH env var)
 *      - returns full config + admin: true
 *   2. Client passHash from clients/{slug}/config.json - returns audience-filtered config
 *
 * SOURCING, changed 2026-09-14. The config is read from the copy BUNDLED with the
 * deployment (api/_data/index.js) and works with no credentials at all. If GITHUB_PAT
 * is present and valid it is tried FIRST, so an admin edit saved through
 * /api/save-runbook shows up without waiting for the redeploy; any failure (expired
 * token, network, 5xx) falls back to the bundled copy instead of returning 500.
 *
 * Why: on 2026-09-14 this endpoint was found returning 500 on every request in
 * production. Two causes, both now fixed: ADMIN_PASS_HASH was unset and treated as
 * required, and the GITHUB_PAT had expired (GitHub 401 Bad credentials). A read path
 * that hard-depends on a rotating credential will break again. This one cannot.
 *
 * Env vars required:
 *   GITHUB_PAT       - OPTIONAL. When set and valid, the config is read live from GitHub
 *                      so admin edits appear immediately. When absent or expired the
 *                      bundled copy is served instead. Never required.
 *   ADMIN_PASS_HASH  - OPTIONAL. sha256 hex digest of the admin passphrase. When absent,
 *                      the admin override is unavailable and client passphrase access
 *                      still works. Do NOT make this required again (2026-09-14: it was,
 *                      it was never set on Vercel, and every request 500'd as a result).
 *
 * Response:
 *   200 { ok: true, admin: true|false, config: {...} }
 *   400 { ok: false, error: 'missing slug or passphrase' }
 *   401 { ok: false, error: 'invalid passphrase' }
 *   404 { ok: false, error: 'client not found' }
 *   500 { ok: false, error: '...' }
 */

const crypto = require('crypto');
const DATA = require('./_data/index.js');

const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;
const REPO_OWNER = 'marty-ux';
const REPO_NAME = 'siq-website';
const BRANCH = 'main';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function audienceFilter(config) {
  const out = JSON.parse(JSON.stringify(config));
  const filterArr = (arr) => arr.filter(item => {
    const a = item && item.audience;
    return !a || a === 'client' || a === 'both';
  });
  if (Array.isArray(out.phases)) out.phases = filterArr(out.phases);
  if (Array.isArray(out.phaseDetails)) out.phaseDetails = filterArr(out.phaseDetails);
  if (Array.isArray(out.tasks)) out.tasks = filterArr(out.tasks);
  if (Array.isArray(out.risks)) out.risks = filterArr(out.risks);
  if (Array.isArray(out.phaseDetails)) {
    out.phaseDetails = out.phaseDetails.map(p => {
      const np = Object.assign({}, p);
      delete np.bullets_internal;
      return np;
    });
  }
  if (Array.isArray(out.phases)) {
    out.phases = out.phases.map(p => {
      const np = Object.assign({}, p);
      delete np.artifact_internal;
      return np;
    });
  }
  delete out.statusLabel_internal;
  delete out.gngWhen_internal;
  delete out.launchTimeline_internal;
  delete out.criticalPath_internal;
  delete out.gng_internal;
  delete out.footer_internal;
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { body = {}; }
  }
  const slug = (body && body.slug || '').toLowerCase().trim();
  const passphrase = (body && body.passphrase || '').trim();
  if (!slug || !passphrase) {
    res.status(400).json({ ok: false, error: 'missing slug or passphrase' });
    return;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    res.status(400).json({ ok: false, error: 'bad slug' });
    return;
  }

  // ADMIN_PASS_HASH is OPTIONAL. It was never set on the Vercel project, and treating
  // it as required meant every request returned 500 before the client passphrase was
  // ever checked. Without it the admin override is unavailable; client access works.

  const bundled = (DATA[slug] && DATA[slug].config) || null;
  let config = null;
  let source = 'bundled';

  // Prefer the live copy when a working token exists, so admin edits appear immediately.
  const pat = process.env.GITHUB_PAT;
  if (pat) {
    try {
      const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/clients/${slug}/config.json?ref=${BRANCH}`;
      const r = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'siq-runbook-api'
        }
      });
      if (r.ok) {
        const j = await r.json();
        config = JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8'));
        source = 'live';
      }
      // Anything else (401 expired token, 404, 5xx) silently falls through to bundled.
    } catch (e) {
      // Network failure falls through to bundled too.
    }
  }

  if (!config) config = bundled;

  if (!config) {
    res.status(404).json({ ok: false, error: 'client not found' });
    return;
  }

  const hash = sha256(passphrase);
  if (ADMIN_PASS_HASH && hash === ADMIN_PASS_HASH) {
    res.status(200).json({ ok: true, admin: true, source, config });
    return;
  }
  if (config.passHash && hash === config.passHash) {
    const filtered = audienceFilter(config);
    res.status(200).json({ ok: true, admin: false, source, config: filtered });
    return;
  }
  res.status(401).json({ ok: false, error: 'invalid passphrase' });
};
