/**
 * Vercel serverless function - /api/blocked
 * Returns 403 for any direct hits to gated paths.
 * Used by vercel.json rewrite to block direct access to /clients/*.json.
 */
module.exports = (req, res) => {
  res.status(403).json({
    ok: false,
    error: 'forbidden',
    hint: 'Client config is gated. Use the passphrase-protected page at /runbook.html?c=<slug>.'
  });
};
