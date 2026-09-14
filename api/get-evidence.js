/**
 * Vercel serverless function - /api/get-evidence
 *
 * POST body: { slug, passphrase, doc, asof }
 *
 *   doc = "evidence"  -> record-level drill-down for the given as-of date
 *   doc = "register"  -> finding register: baselines, targets, owners, status
 *   doc = "both"      -> both in one response (default)
 *
 * SECURITY MODEL
 *   - The passphrase is validated SERVER SIDE against the client's passHash
 *     (sha256) in clients/<slug>/config.json, or against ADMIN_PASS_HASH.
 *   - middleware.js blocks the static clients/<slug>/*.json paths, so the only
 *     route to this data is through this function.
 *   - The payload carries named accounts, deal values, owners and HubSpot record
 *     links. It must never sit in static HTML behind a client-side check.
 *
 * NO CREDENTIALS REQUIRED. The data is bundled with the deployment via
 * api/_data/index.js rather than fetched from GitHub with a PAT. That PAT was
 * found expired on 2026-09-14 (GitHub 401 Bad credentials), which is one of the
 * two reasons /api/get-runbook had been failing in production. Nothing here can
 * expire. Do not reintroduce a network fetch for this data.
 *
 * Env vars:
 *   ADMIN_PASS_HASH  - OPTIONAL. sha256 hex digest of the admin passphrase. When
 *                      absent the admin override is unavailable and client
 *                      passphrase access still works. Do NOT make this required:
 *                      it was, it was never set on Vercel, and every request 500'd.
 *
 * Response:
 *   200 { ok: true, admin: bool, evidence: {...}|null, register: {...}|null }
 *   400 { ok: false, error: 'missing slug or passphrase' | 'bad slug' | ... }
 *   401 { ok: false, error: 'invalid passphrase' }
 *   404 { ok: false, error: 'client not found' | 'document not found' }
 */

const crypto = require('crypto');
const DATA = require('./_data/index.js');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function safeSegment(s) {
  return /^[A-Za-z0-9_-]+$/.test(s || '');
}
function safeDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '');
}
// Constant-time compare so a wrong passphrase cannot be narrowed by timing.
function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
  if (['evidence', 'register', 'both'].indexOf(doc) === -1) {
    res.status(400).json({ ok: false, error: 'bad doc' });
    return;
  }

  const client = DATA[slug];
  if (!client) {
    res.status(404).json({ ok: false, error: 'client not found' });
    return;
  }

  // ---- authenticate ----
  const hash = sha256(passphrase);
  const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;
  const isAdmin = !!ADMIN_PASS_HASH && sameHash(hash, ADMIN_PASS_HASH);
  // Report gate passphrase first, then the runbook config passphrase as a fallback,
  // so either credential opens this page for an authorised viewer.
  const isClient = sameHash(hash, client.passHash) ||
                   sameHash(hash, client.config && client.config.passHash);
  if (!isAdmin && !isClient) {
    res.status(401).json({ ok: false, error: 'invalid passphrase' });
    return;
  }

  // ---- serve ----
  const out = { ok: true, admin: isAdmin, evidence: null, register: null };

  if (doc === 'register' || doc === 'both') {
    out.register = client.register || null;
  }

  if (doc === 'evidence' || doc === 'both') {
    const date = asof || (client.register && client.register.baselineDate) || '';
    if (safeDate(date)) {
      out.evidence = (client.evidence && client.evidence[date]) || null;
    } else if (doc === 'evidence') {
      res.status(400).json({ ok: false, error: 'no asof given and no baselineDate on register' });
      return;
    }
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
