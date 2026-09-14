/**
 * Bundled client data for /api/get-evidence.
 *
 * WHY THIS EXISTS: get-evidence originally read its JSON from GitHub with a PAT,
 * copying the pattern in get-runbook. On 2026-09-14 that PAT was found to be expired
 * (GitHub returned 401 Bad credentials), which is one of the two reasons the runbook
 * API had been failing in production. Requiring the JSON directly removes the network
 * call, the credential, and the expiry: the data ships with the deployment.
 *
 * Files under api/ whose name starts with an underscore are not routed by Vercel, so
 * nothing here is publicly reachable. These are STATIC requires on purpose. A dynamic
 * require would not be traced by the bundler and would fail at runtime.
 *
 * To publish a new snapshot: drop the JSON in api/_data/<slug>/ and add one line below.
 */
module.exports = {
  romify: {
    // The runbook config carries its own separate passphrase, so it is NOT reused here.
    // The reports Ben and Megan already hold are gated on "romify-2026", and this is its
    // sha256. That string is not a secret: it sits in plaintext in five deployed report
    // pages today. The security win here is that the DATA is server side, not that the
    // passphrase is strong. Raising passphrase entropy is a separate, tracked change.
    passHash: 'a2a4e8f9cf22d29dff968291b7289b57ee41561eca5eea1493f7a843b50b8c10',
    config: require('../../clients/romify/config.json'),
    register: require('./romify/register.json'),
    evidence: {
      '2026-09-09': require('./romify/evidence-2026-09-09.json')
    }
  }
};
