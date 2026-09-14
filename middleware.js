/**
 * Vercel Edge Middleware
 * Runs BEFORE static file serving.
 *
 * Blocks public access to client source data under /clients/<slug>/ :
 *   config.json              audience-tagged runbook source
 *   register-*.json          finding register (targets, owners, status)
 *   register.json
 *   evidence-*.json          record-level drill-down: named accounts, deal
 *                            values, owners, HubSpot record links
 *
 * These are served only through the passphrase-checked API routes:
 *   /api/get-runbook   (config)
 *   /api/get-evidence  (evidence + register)
 */
export const config = {
  matcher: [
    '/clients/:slug/config.json',
    '/clients/:slug/register.json',
    '/clients/:slug/:file(evidence-.*\\.json)',
    '/clients/:slug/:file(register-.*\\.json)'
  ]
};

export default function middleware(request) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'forbidden',
      hint: 'Client data is gated. Use /api/get-runbook or /api/get-evidence with a valid passphrase.'
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
