/**
 * Vercel serverless function - /api/get-stack-health
 *
 * POST body: { slug, passphrase, asof? }
 *
 * Returns one Stack Health data pack. stack-health.html renders entirely from it
 * and never computes a score of its own, so what the client reads is exactly what
 * build_stack_pack.py produced and signed off at the QA gate.
 *
 * SECURITY MODEL
 *   - Passphrase validated SERVER SIDE against the client's passHash (sha256) in
 *     api/_stackhealth-index.js, or against ADMIN_PASS_HASH.
 *   - The pack carries named vendors, exact annual costs, seat counts, renewal
 *     dates and contract terms. It must never sit in static HTML behind a
 *     client-side check.
 *   - Packs live ONLY in api/_stackhealth-*.json. Vercel does not route any file
 *     under api/ whose name starts with an underscore, so there is no public path
 *     to the raw JSON and this route does not depend on middleware.js being
 *     correct. That is deliberate: one fewer thing that can silently stop
 *     protecting the data.
 *
 * NO CREDENTIALS REQUIRED. Data ships with the deployment via static requires.
 * There is no network call and nothing to expire. The GitHub PAT that broke
 * /api/get-runbook in production on 2026-09-14 is exactly the pattern being
 * avoided here. Do not reintroduce a fetch for this data.
 *
 * Env vars:
 *   ADMIN_PASS_HASH  - OPTIONAL. sha256 hex of the admin passphrase. When absent
 *                      the admin override is simply unavailable and client
 *                      passphrase access still works. Do NOT make it required.
 *
 * Response:
 *   200 { ok:true, admin:bool, asof:'YYYY-MM-DD', available:[...dates], pack:{...} }
 *   400 { ok:false, error:'missing slug or passphrase' | 'bad slug' | 'bad asof...' }
 *   401 { ok:false, error:'invalid passphrase' }
 *   404 { ok:false, error:'client not found' | 'no pack for that date' }
 *   405 { ok:false, error:'method not allowed' }
 */

const crypto = require('crypto');
const DATA = require('./_stackhealth-index.js');

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

  const slug = ((body && body.slug) || '').toLowerCase().trim();
  const passphrase = ((body && body.passphrase) || '').trim();
  const asof = ((body && body.asof) || '').trim();

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

  const client = DATA[slug];
  if (!client) {
    res.status(404).json({ ok: false, error: 'client not found' });
    return;
  }

  // ---- authenticate ----
  const hash = sha256(passphrase);
  const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;
  const isAdmin = !!ADMIN_PASS_HASH && sameHash(hash, ADMIN_PASS_HASH);
  const isClient = sameHash(hash, client.passHash);
  if (!isAdmin && !isClient) {
    res.status(401).json({ ok: false, error: 'invalid passphrase' });
    return;
  }

  // ---- serve ----
  const available = Object.keys(client.packs).sort();
  const date = asof || client.latest || available[available.length - 1];
  const pack = client.packs[date];

  if (!pack) {
    res.status(404).json({ ok: false, error: 'no pack for that date', available: available });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, admin: isAdmin, asof: date, available: available, pack: pack });
};
