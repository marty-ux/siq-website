/**
 * Vercel serverless function - /api/get-runbook
 *
 * POST body: { slug, passphrase }
 *
 * Validates passphrase against:
 *   1. Admin hash (siq-admin-runbook-2026 sha256) - returns full config + admin: true
 *   2. Client passHash from clients/{slug}/config.json - returns audience-filtered config
 *
 * Reads source JSON from GitHub via PAT to avoid exposing the static file path.
 *
 * Response:
 *   200 { ok: true, admin: true|false, config: {...} }
 *   400 { ok: false, error: 'missing slug or passphrase' }
 *   401 { ok: false, error: 'invalid passphrase' }
 *   404 { ok: false, error: 'client not found' }
 *   500 { ok: false, error: '...' }
 */

const crypto = require('crypto');

const ADMIN_PASS_HASH = 'c396ec00848e1c04ff30bb9fd924edeb1aae36915f68db30da44b2b2c2f9f6a8';
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
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    res.status(500).json({ ok: false, error: 'server not configured (no PAT)' });
    return;
  }
  const filePath = `clients/${slug}/config.json`;
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${BRANCH}`;
  let config = null;
  try {
    const r = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'siq-runbook-api'
      }
    });
    if (r.status === 404) {
      res.status(404).json({ ok: false, error: 'client not found' });
      return;
    }
    if (!r.ok) {
      const t = await r.text();
      res.status(500).json({ ok: false, error: 'github fetch failed: ' + r.status + ' ' + t.slice(0, 200) });
      return;
    }
    const j = await r.json();
    const content = Buffer.from(j.content, 'base64').toString('utf-8');
    config = JSON.parse(content);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'fetch error: ' + e.message });
    return;
  }
  const hash = sha256(passphrase);
  if (hash === ADMIN_PASS_HASH) {
    res.status(200).json({ ok: true, admin: true, config });
    return;
  }
  if (config.passHash && hash === config.passHash) {
    const filtered = audienceFilter(config);
    res.status(200).json({ ok: true, admin: false, config: filtered });
    return;
  }
  res.status(401).json({ ok: false, error: 'invalid passphrase' });
};
