/**
 * Vercel Edge Middleware
 * Runs BEFORE static file serving.
 * Blocks public access to /clients/<slug>/config.json (audience-tagged source data).
 * Use /api/get-runbook with a valid passphrase instead.
 */
export const config = {
  matcher: '/clients/:slug/config.json'
};

export default function middleware(request) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'forbidden',
      hint: 'Client config is gated. Use the passphrase-protected page at /runbook.html?c=<slug>.'
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
