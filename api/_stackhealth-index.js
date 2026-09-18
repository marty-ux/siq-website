/**
 * Bundled Stack Health data packs for /api/get-stack-health.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT UNDER /clients/
 *   Vercel does not route any file under api/ whose name starts with an underscore,
 *   so api/_stackhealth-*.json is not publicly reachable. Packs live HERE ONLY, flat
 *   in api/, which also means publishing one needs no new directory.
 *
 *   They are deliberately NOT mirrored under /clients/<slug>/ the way the evidence
 *   data is. That arrangement depends on middleware.js staying correct to keep the
 *   raw JSON private. One copy, in a location that cannot be routed at all, removes
 *   that dependency entirely.
 *
 *   These are STATIC requires on purpose. A dynamic require is not traced by the
 *   bundler and fails at runtime.
 *
 * TO PUBLISH A NEW CLIENT OR A NEW AS-OF DATE
 *   1. Build the pack:  python3 scripts/build_stack_pack.py ... --out <pack>.json
 *   2. Drop it in       api/_stackhealth-<slug>-<YYYY-MM-DD>.json
 *   3. Add one line     below, and set `latest` to the newest date.
 *   Nothing else changes. stack-health.html is client-agnostic and reads ?c=<slug>.
 *
 * PASSPHRASES
 *   passHash is the sha256 of the report passphrase. The hash is not the security
 *   boundary. The security boundary is that the DATA is server side and the raw
 *   JSON has no public route. Raising passphrase entropy is a separate change.
 */
module.exports = {
  acme: {
    // Sample tenant. Synthetic data, used for demonstrations and nothing else.
    // Passphrase: stack-2026 (unchanged from the static demo it replaces, so any
    // link already sent to a prospect keeps working).
    passHash: '45e0aec5c9e44e1316c182f387314933aaffe5310714e1782fea299e2bc29147',
    latest: '2026-09-18',
    packs: {
      '2026-09-18': require('./_stackhealth-acme-2026-09-18.json')
    }
  }
};
