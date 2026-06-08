/**
 * Vercel serverless function â /api/save-runbook
 * Receives admin-authenticated edits to a client runbook config and commits the
 * updated JSON back to siq-website via the GitHub Contents API.
 *
 * POST body: { adminPass, clientSlug, editor, config }
 *
 * Env vars required:
 *   GITHUB_PAT â fine-grained PAT with Contents:Read+Write on marty-ux/siq-website
 *
 * Admin passphrase is hash-verified against ADMIN_PASS_HASH (hardcoded below for v1;
 * move to env var on rotation).
 */

const crypto = require('crypto');

const ADMIN_PASS_HASH = 'c396ec00848e1c04ff30bb9fd924edeb1aae36915f68db30da44b2b2c2f9f6a8';
const REPO_OWNER = 'marty-ux';
const REPO_NAME = 'siq-website';
const BRANCH = 'main';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function bad(res, status, msg) {
  return res.status(status).json({ ok: false, error: msg });
}

module.exports = async (req, res) => {
  /* CORS for same-origin POST */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return bad(res, 405, 'method not allowed');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'invalid JSON body'); }
  }
  if (!body) return bad(res, 400, 'missing body');

  const { adminPass, clientSlug, editor, config } = body;

  /* Auth */
  if (!adminPass) return bad(res, 401, 'missing adminPass');
  if (sha256(adminPass) !== ADMIN_PASS_HASH) return bad(res, 401, 'invalid adminPass');

  /* Validate input */
  if (!clientSlug || !/^[a-z0-9-]+$/.test(clientSlug)) return bad(res, 400, 'invalid clientSlug');
  if (!config || typeof config !== 'object') return bad(res, 400, 'missing config');
  if (config.slug && config.slug !== clientSlug) return bad(res, 400, 'config.slug mismatch');

  /* Light schema check â required top-level keys */
  const required = ['name', 'passHash', 'phases', 'tasks', 'risks'];
  for (const k of required) {
    if (!(k in config)) return bad(res, 400, `config missing required key: ${k}`);
  }

  /* Stamp audit trail */
  config.lastEditedBy = (editor || 'unknown').slice(0, 80);
  config.lastEditedAt = new Date().toISOString();

  /* Get current SHA from GitHub */
  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) return bad(res, 500, 'GITHUB_PAT env var not set on Vercel');

  const path = `clients/${clientSlug}/config.json`;
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;

  let currentSha = null;
  try {
    const getRes = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'siq-runbook-admin/1.0',
      },
    });
    if (getRes.status === 200) {
      const cur = await getRes.json();
      currentSha = cur.sha;
    } else if (getRes.status === 404) {
      /* File doesn't exist yet â first save creates it */
      currentSha = null;
    } else {
      const errText = await getRes.text();
      return bad(res, 502, `github GET failed (${getRes.status}): ${errText.slice(0, 200)}`);
    }
  } catch (e) {
    return bad(res, 502, `github GET error: ${e.message}`);
  }

  /* PUT new content */
  const newContent = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  const commitMsg = `Update ${clientSlug} runbook (admin edit by ${config.lastEditedBy})`;
  const putBody = { message: commitMsg, content: newContent, branch: BRANCH };
  if (currentSha) putBody.sha = currentSha;

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'siq-runbook-admin/1.0',
      },
      body: JSON.stringify(putBody),
    });
    if (putRes.status !== 200 && putRes.status !== 201) {
      const errText = await putRes.text();
      return bad(res, 502, `github PUT failed (${putRes.status}): ${errText.slice(0, 200)}`);
    }
    const result = await putRes.json();
    return res.status(200).json({
      ok: true,
      commit: result.commit?.sha,
      url: result.commit?.html_url,
      editor: config.lastEditedBy,
      at: config.lastEditedAt,
    });
  } catch (e) {
    return bad(res, 502, `github PUT error: ${e.message}`);
  }
};
