/**
 * Vercel serverless function - /api/get-evidence
 *
 * POST body: { slug, passphrase, doc, asof }
 *
 *   doc = "evidence"  -> clients/{slug}/evidence-{asof}.json   (record-level drill-down)
 *   doc = "register"  -> clients/{slug}/register.json          (finding register + targets)
 *   doc = "both"      -> both of the above in one response     (default)
 *
 * Mirrors /api/get-runbook exactly:
 *   - passphrase is validated SERVER SIDE against the client's passHash in
 *     clients/{slug}/config.json, or against ADMIN_PASS_HASH
 *   - source JSON is read from GitHub via PAT, never served as a static file
 *   - middleware.js blocks the static paths so there is no way around this route
 *
 * This matters: the evidence payload carries named accounts, deal values, owners
 * and HubSpot record links. It must never sit in static HTML behind a client-side
 * passphrase check.
 *
 * Env vars required (already set for get-runbook):
 *   GITHUB_PAT       - fine-grained PAT with Contents:Read on marty-ux/siq-website
 *   ADMIN_PASS_HASH  - sha256 hex digest of the admin passphrase
 *
 * Response:
 *   200 { ok: true, admin: true|false, evidence: {...}|null, register: {...}|null }
 *   400 { ok: false, error: 'missing slug or passphrase' }
 *   401 { ok: false, error: 'invalid passphrase' }
 *   404 { ok: false, error: 'client not found' | 'document not found' }
 *   500 { ok: false, error: '...' }
 */

const crypto = require('crypto');

const REPO_OWNER = 'marty-ux';
const REPO_NAME = 'siq-website';
const BRANCH = 'main';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Guard against path traversal in anything that reaches a GitHub path.
function safeSegment(s) {
  return /^[A-Za-z0-9_-]+$/.test(s || '');
}
function safeDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '');
}

async function ghJson(filePath, pat) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${BRANCH}`;
  const r = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'siq-evidence-api'
    }
  });
  if (r.status === 404) return { missing: true };
  if (!r.ok) {
    const t = await r.text();
    throw new Error('github fetch failed: ' + r.status + ' ' + t.slice(0, 200));
  }
  const j = await r.json();
  // The contents API returns empty content above ~1MB. Fall back to the raw
  // download_url so a large evidence file still resolves.
  if ((!j.content || j.content.length === 0) && j.download_url) {
    const raw = await fetch(j.download_url, {
      headers: { 'Authorization': `Bearer ${pat}`, 'User-Agent': 'siq-evidence-api' }
    });
    if (!raw.ok) throw new Error('raw fetch failed: ' + raw.status);
    return JSON.parse(await raw.text());
  }
  return JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8'));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const slug = (body && body.slug || '').toLowerCase().trim();
  const passphrase = (body && body.passphrase || '').trim();
  const doc = (body && body.doc || 'both').toLowerCase().trim();
  const asof = (body && body.asof || '').trim();

  if (!slug || !passphrase) {
    res.status(400).json({ ok: false, error: 'missing slug or passphrase' });
    return;
  }
  if (!safeSegment(slug)) {
    res.status(400).json({ ok: false, error: 'bad slug' });
    return;
  }
  if (asof && !safeDate(asof)) {
    res.status(400).json({ ok: false, error: 'bad asof, expected YYYY-MM-DD' });
    return;
  }
  if (!['evidence', 'register', 'both'].includes(doc)) {
    res.status(400).json({ ok: false, error: 'bad doc' });
    return;
  }

  const pat = process.env.GITHUB_PAT;
  const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;
  if (!pat) {
    res.status(500).json({ ok: false, error: 'server not configured (no PAT)' });
    return;
  }
  if (!ADMIN_PASS_HASH) {
    res.status(500).json({ ok: false, error: 'server not configured (no ADMIN_PASS_HASH)' });
    return;
  }

  // 1. Authenticate against the same passHash the runbook uses.
  let config;
  try {
    config = await ghJson(`clients/${slug}/config.json`, pat);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
    return;
  }
  if (config && config.missing) {
    res.status(404).json({ ok: false, error: 'client not found' });
    return;
  }

  const hash = sha256(passphrase);
  const isAdmin = hash === ADMIN_PASS_HASH;
  const isClient = !!(config.passHash && hash === config.passHash);
  if (!isAdmin && !isClient) {
    res.status(401).json({ ok: false, error: 'invalid passphrase' });
    return;
  }

  // 2. Serve the requested documents.
  const out = { ok: true, admin: isAdmin, evidence: null, register: null };
  try {
    if (doc === 'register' || doc === 'both') {
      const r = await ghJson(`clients/${slug}/register.json`, pat);
      out.register = (r && r.missing) ? null : r;
    }
    if (doc === 'evidence' || doc === 'both') {
      const date = asof || (out.register && out.register.baselineDate) || '';
      if (!safeDate(date)) {
        if (doc === 'evidence') {
          res.status(400).json({ ok: false, error: 'no asof given and no baselineDate on register' });
          return;
        }
      } else {
        const e = await ghJson(`clients/${slug}/evidence-${date}.json`, pat);
        out.evidence = (e && e.missing) ? null : e;
      }
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
    return;
  }

  if (doc === 'evidence' && !out.evidence) {
    res.status(404).json({ ok: false, error: 'document not found' });
    return;
  }
  if (doc === 'register' && !out.register) {
    res.status(404).json({ ok: false, error: 'document not found' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
};
